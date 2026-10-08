# syntax=docker/dockerfile:1

# ---- dependencies -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript (server) and bundle the browser code ---------
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/app/storage/uploads
WORKDIR /app
RUN addgroup -S flowdesk && adduser -S flowdesk -G flowdesk
COPY --from=build --chown=flowdesk:flowdesk /app/package.json ./
COPY --from=build --chown=flowdesk:flowdesk /app/node_modules ./node_modules
COPY --from=build --chown=flowdesk:flowdesk /app/dist ./dist
COPY --from=build --chown=flowdesk:flowdesk /app/public ./public
COPY --from=build --chown=flowdesk:flowdesk /app/views ./views
COPY --from=build --chown=flowdesk:flowdesk /app/migrations ./migrations
RUN mkdir -p /app/storage/uploads && chown -R flowdesk:flowdesk /app/storage
USER flowdesk
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Migrations are idempotent and guarded by an advisory lock, so every instance can run them on start.
CMD ["sh", "-c", "node dist/db/cli/migrate.js && node dist/server.js"]
