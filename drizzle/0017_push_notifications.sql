CREATE TABLE push_accounts (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 1,
  deadline INTEGER NOT NULL DEFAULT 1,
  overdue INTEGER NOT NULL DEFAULT 1,
  monthly INTEGER NOT NULL DEFAULT 1,
  enabled_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);
CREATE TABLE push_watches (
  tenant_id TEXT NOT NULL,
  supervisor_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  enabled_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, supervisor_id, tech_id),
  FOREIGN KEY (tenant_id, supervisor_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);
CREATE TABLE push_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  submission_id TEXT,
  revision INTEGER,
  message TEXT NOT NULL,
  url TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);
CREATE INDEX idx_push_outbox_due ON push_outbox(sent_at, next_attempt_at);
