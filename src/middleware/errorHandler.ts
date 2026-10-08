import type { FastifyError, FastifyInstance } from 'fastify';
import { isHtmx } from './htmx.js';
import { AppError } from '../utils/errors.js';

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Sign in required',
  403: 'Access denied',
  404: 'Page not found',
  409: 'Conflict',
  413: 'File too large',
  422: 'Check your input',
  429: 'Slow down',
  500: 'Something went wrong',
};

/**
 * Maps errors to responses. HTMX requests get a status code + X-Error-Message header (shown as a
 * toast by the client, no swap); browser navigation gets a rendered error page. Unexpected errors
 * are logged with stack traces but never leak details to the client.
 */
export function registerErrorHandling(app: FastifyInstance) {
  app.setErrorHandler(async (error: FastifyError | AppError, req, reply) => {
    let status = 500;
    let message = 'An unexpected error occurred. The team has been notified.';
    if (error instanceof AppError) {
      status = error.statusCode;
      message = error.message;
    } else if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      status = error.statusCode;
      message =
        error.code === 'FST_REQ_FILE_TOO_LARGE'
          ? 'The file is too large.'
          : 'The request could not be processed.';
    }

    if (status >= 500) req.log.error({ err: error, url: req.url }, 'unhandled error');
    else if (status === 403 || status === 401)
      req.log.warn({ url: req.url, actorId: req.actor?.id, reason: message }, 'access denied');

    if (isHtmx(req)) {
      return reply
        .code(status)
        .header('X-Error-Message', encodeURIComponent(message))
        .type('text/plain')
        .send(message);
    }
    if (req.headers.accept?.includes('text/html') || req.method === 'GET') {
      return reply
        .code(status)
        .render('pages/error.njk', { status, title: TITLES[status] ?? 'Error', message });
    }
    return reply.code(status).send({ error: message });
  });

  app.setNotFoundHandler(async (req, reply) => {
    if (isHtmx(req)) return reply.code(404).header('X-Error-Message', 'Not%20found').send('Not found');
    return reply.code(404).render('pages/error.njk', {
      status: 404,
      title: TITLES[404],
      message: 'The page you are looking for does not exist or you do not have access to it.',
    });
  });
}
