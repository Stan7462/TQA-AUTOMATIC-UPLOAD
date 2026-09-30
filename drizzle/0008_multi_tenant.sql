-- Add tenant/domain ownership and preserve all existing records in the default tenant.
PRAGMA foreign_keys=OFF;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE tenant_domains (
  hostname TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
INSERT INTO tenants (id, name, active, created_at) VALUES ('default', 'TQA', 1, CAST(strftime('%s','now') AS INTEGER) * 1000);
INSERT INTO tenant_domains (hostname, tenant_id, created_at) VALUES
  ('qc.leadtechx.com', 'default', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('localhost', 'default', CAST(strftime('%s','now') AS INTEGER) * 1000),
  ('127.0.0.1', 'default', CAST(strftime('%s','now') AS INTEGER) * 1000);

ALTER TABLE technicians RENAME TO technicians_legacy;
CREATE TABLE technicians (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_ciphertext TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
INSERT INTO technicians (tenant_id, tech_id, pin_salt, pin_hash, pin_ciphertext, active, is_admin, failed_attempts, locked_until, created_at)
SELECT 'default', tech_id, pin_salt, pin_hash, pin_ciphertext, active, CASE WHEN tech_id = '1111' THEN 1 ELSE 0 END, failed_attempts, locked_until, created_at
FROM technicians_legacy;

ALTER TABLE tech_sessions RENAME TO tech_sessions_legacy;
CREATE TABLE tech_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id, tech_id) REFERENCES technicians(tenant_id, tech_id) ON DELETE CASCADE
);
INSERT INTO tech_sessions (token_hash, tenant_id, tech_id, expires_at, created_at)
SELECT token_hash, 'default', tech_id, expires_at, created_at FROM tech_sessions_legacy;

ALTER TABLE technician_removals RENAME TO technician_removals_legacy;
CREATE TABLE technician_removals (
  tenant_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'deleting',
  started_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, tech_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
INSERT INTO technician_removals (tenant_id, tech_id, state, started_at)
SELECT 'default', tech_id, state, started_at FROM technician_removals_legacy;

ALTER TABLE qc_submissions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE qc_upload_photos RENAME TO qc_upload_photos_legacy;
CREATE TABLE qc_upload_photos (
  tenant_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  image BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, submission_id, tech_id, slot),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
INSERT INTO qc_upload_photos (tenant_id, submission_id, tech_id, slot, image, created_at)
SELECT 'default', submission_id, tech_id, slot, image, created_at FROM qc_upload_photos_legacy;

ALTER TABLE trust_api_keys ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

DROP TABLE tech_sessions_legacy;
DROP TABLE technician_removals_legacy;
DROP TABLE technicians_legacy;
DROP TABLE qc_upload_photos_legacy;

CREATE INDEX idx_technicians_tenant_active ON technicians(tenant_id, active, tech_id);
CREATE INDEX idx_sessions_tenant_tech ON tech_sessions(tenant_id, tech_id);
CREATE INDEX idx_qc_submissions_tenant_status ON qc_submissions(tenant_id, status, submitted_at);
CREATE INDEX idx_qc_submissions_tenant_tech ON qc_submissions(tenant_id, tech_id, submitted_at);
CREATE INDEX idx_qc_submissions_tenant_trust ON qc_submissions(tenant_id, status, trust_upload_status, reviewed_at, id);
CREATE INDEX idx_qc_upload_photos_tenant_created ON qc_upload_photos(tenant_id, created_at);
CREATE INDEX idx_trust_api_keys_tenant ON trust_api_keys(tenant_id, revoked_at, created_at);

PRAGMA foreign_keys=ON;
