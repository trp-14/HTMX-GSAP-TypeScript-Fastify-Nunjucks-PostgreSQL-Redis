-- FlowDesk initial schema.
-- PostgreSQL is the source of truth for every persistent business record.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisation & identity
-- ---------------------------------------------------------------------------

CREATE TABLE departments (
  id          SMALLSERIAL PRIMARY KEY,
  code        VARCHAR(12)  NOT NULL UNIQUE,
  name        VARCHAR(80)  NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id          SMALLSERIAL PRIMARY KEY,
  name        VARCHAR(20)  NOT NULL UNIQUE
              CHECK (name IN ('EMPLOYEE', 'MANAGER', 'OPERATIONS', 'ADMIN')),
  description TEXT         NOT NULL
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(254) NOT NULL,
  full_name      VARCHAR(120) NOT NULL CHECK (length(trim(full_name)) >= 2),
  job_title      VARCHAR(120),
  department_id  SMALLINT REFERENCES departments(id) ON DELETE SET NULL,
  password_hash  TEXT         NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_department_idx ON users (department_id);

CREATE TABLE user_roles (
  user_id     UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     SMALLINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX user_roles_role_idx ON user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Requests & workflow
-- ---------------------------------------------------------------------------

CREATE TABLE request_types (
  id           SMALLSERIAL PRIMARY KEY,
  code         VARCHAR(30)  NOT NULL UNIQUE,
  name         VARCHAR(80)  NOT NULL UNIQUE,
  description  TEXT         NOT NULL,
  sla_days     SMALLINT     NOT NULL DEFAULT 5 CHECK (sla_days BETWEEN 1 AND 90)
);

CREATE SEQUENCE request_number_seq START WITH 1001;

CREATE TABLE requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number  INTEGER      NOT NULL UNIQUE DEFAULT nextval('request_number_seq'),
  title           VARCHAR(160) NOT NULL CHECK (length(trim(title)) >= 4),
  description     TEXT         NOT NULL,
  request_type_id SMALLINT     NOT NULL REFERENCES request_types(id),
  requester_id    UUID         NOT NULL REFERENCES users(id),
  department_id   SMALLINT     NOT NULL REFERENCES departments(id),
  priority        VARCHAR(10)  NOT NULL DEFAULT 'MEDIUM'
                  CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED',
                                    'CHANGES_REQUESTED', 'PROCESSING', 'COMPLETED')),
  assignee_id     UUID         REFERENCES users(id) ON DELETE SET NULL,
  due_date        DATE,
  submitted_at    TIMESTAMPTZ,
  decided_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
);
ALTER SEQUENCE request_number_seq OWNED BY requests.request_number;
CREATE INDEX requests_status_idx      ON requests (status);
CREATE INDEX requests_requester_idx   ON requests (requester_id);
CREATE INDEX requests_assignee_idx    ON requests (assignee_id);
CREATE INDEX requests_created_at_idx  ON requests (created_at DESC);
CREATE INDEX requests_department_idx  ON requests (department_id);
CREATE INDEX requests_search_idx      ON requests
  USING gin (to_tsvector('english', title || ' ' || description));

CREATE TABLE request_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES users(id),
  body        TEXT        NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX request_comments_request_idx ON request_comments (request_id, created_at);

CREATE TABLE request_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID         NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  uploaded_by    UUID         NOT NULL REFERENCES users(id),
  original_name  VARCHAR(255) NOT NULL,
  storage_key    VARCHAR(80)  NOT NULL UNIQUE,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INTEGER      NOT NULL CHECK (size_bytes > 0),
  checksum_sha256 CHAR(64)    NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX request_attachments_request_idx ON request_attachments (request_id);

CREATE TABLE workflow_transitions (
  id           BIGSERIAL PRIMARY KEY,
  request_id   UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  from_status  VARCHAR(20),
  to_status    VARCHAR(20) NOT NULL,
  actor_id     UUID        NOT NULL REFERENCES users(id),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_status IS DISTINCT FROM to_status)
);
CREATE INDEX workflow_transitions_request_idx ON workflow_transitions (request_id, created_at);
CREATE INDEX workflow_transitions_to_status_idx ON workflow_transitions (to_status, created_at DESC);

CREATE TABLE approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID        NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  approver_id  UUID        NOT NULL REFERENCES users(id),
  decision     VARCHAR(20) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED')),
  comment      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX approvals_request_idx ON approvals (request_id);
CREATE INDEX approvals_decision_created_idx ON approvals (decision, created_at DESC);

-- ---------------------------------------------------------------------------
-- Products & inventory
-- ---------------------------------------------------------------------------

CREATE TABLE product_categories (
  id           SMALLSERIAL PRIMARY KEY,
  slug         VARCHAR(40)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name         VARCHAR(80)  NOT NULL UNIQUE,
  description  TEXT         NOT NULL DEFAULT '',
  art          VARCHAR(20)  NOT NULL DEFAULT 'box',
  hue          SMALLINT     NOT NULL DEFAULT 210 CHECK (hue BETWEEN 0 AND 360)
);

CREATE TABLE products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                VARCHAR(32)   NOT NULL CHECK (sku ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  name               VARCHAR(120)  NOT NULL CHECK (length(trim(name)) >= 2),
  description        TEXT          NOT NULL DEFAULT '',
  category_id        SMALLINT      NOT NULL REFERENCES product_categories(id),
  price              NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  stock_quantity     INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reorder_threshold  INTEGER       NOT NULL DEFAULT 5 CHECK (reorder_threshold >= 0),
  status             VARCHAR(14)   NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  inventory_status   VARCHAR(14)   NOT NULL
                     CHECK (inventory_status IN ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK')),
  image_key          VARCHAR(80),
  image_mime         VARCHAR(40) CHECK (image_mime IN ('image/png', 'image/jpeg', 'image/webp')),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- The derived inventory status can never drift from the quantity/threshold that define it.
  CONSTRAINT products_inventory_status_consistent CHECK (
       (stock_quantity = 0 AND inventory_status = 'OUT_OF_STOCK')
    OR (stock_quantity > 0 AND stock_quantity <= reorder_threshold AND inventory_status = 'LOW_STOCK')
    OR (stock_quantity > reorder_threshold AND inventory_status = 'IN_STOCK')
  )
);
CREATE UNIQUE INDEX products_sku_key ON products (sku);
CREATE INDEX products_category_idx ON products (category_id);
CREATE INDEX products_inventory_status_idx ON products (inventory_status);
CREATE INDEX products_status_idx ON products (status);
CREATE INDEX products_search_idx ON products
  USING gin (to_tsvector('english', name || ' ' || sku || ' ' || description));

CREATE TABLE inventory_movements (
  id                 BIGSERIAL PRIMARY KEY,
  product_id         UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  actor_id           UUID        REFERENCES users(id) ON DELETE SET NULL,
  movement_type      VARCHAR(12) NOT NULL
                     CHECK (movement_type IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'RETURN', 'INITIAL')),
  quantity_delta     INTEGER     NOT NULL,
  previous_quantity  INTEGER     NOT NULL CHECK (previous_quantity >= 0),
  new_quantity       INTEGER     NOT NULL CHECK (new_quantity >= 0),
  reason             VARCHAR(240),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (new_quantity = previous_quantity + quantity_delta)
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements (product_id, created_at DESC);
CREATE INDEX inventory_movements_created_idx ON inventory_movements (created_at DESC);

-- ---------------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(40)  NOT NULL,
  title        VARCHAR(200) NOT NULL,
  body         TEXT         NOT NULL DEFAULT '',
  link         VARCHAR(300),
  entity_type  VARCHAR(30),
  entity_id    VARCHAR(64),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_read_idx ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  actor_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(40) NOT NULL,
  entity_type     VARCHAR(30) NOT NULL,
  entity_id       VARCHAR(64) NOT NULL,
  previous_state  JSONB,
  new_state       JSONB,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_action_idx ON audit_logs (action);

-- ---------------------------------------------------------------------------
-- Knowledge Center
-- ---------------------------------------------------------------------------

CREATE TABLE kb_categories (
  id           SMALLSERIAL PRIMARY KEY,
  slug         VARCHAR(40) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name         VARCHAR(80) NOT NULL UNIQUE,
  description  TEXT        NOT NULL,
  position     SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE kb_articles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             VARCHAR(100) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  category_id      SMALLINT     NOT NULL REFERENCES kb_categories(id),
  title            VARCHAR(180) NOT NULL,
  summary          VARCHAR(400) NOT NULL,
  body_markdown    TEXT         NOT NULL,
  tags             TEXT[]       NOT NULL DEFAULT '{}',
  reading_minutes  SMALLINT     NOT NULL DEFAULT 3,
  author_id        UUID         REFERENCES users(id) ON DELETE SET NULL,
  published_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  search_vector    TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body_markdown, '')), 'C')
  ) STORED
);
CREATE INDEX kb_articles_category_idx ON kb_articles (category_id, published_at DESC);
CREATE INDEX kb_articles_search_idx ON kb_articles USING gin (search_vector);
CREATE INDEX kb_articles_tags_idx ON kb_articles USING gin (tags);

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------

CREATE TABLE system_settings (
  key         VARCHAR(60) PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
