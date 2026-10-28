ALTER TABLE tenants ADD COLUMN company_kind TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE tenants ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN plan_name TEXT NOT NULL DEFAULT 'Standard';
ALTER TABLE tenants ADD COLUMN renewal_at INTEGER;
ALTER TABLE tenants ADD COLUMN contact_email TEXT;
ALTER TABLE tenants ADD COLUMN subscription_notes TEXT;
CREATE TABLE super_admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  credential_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  selected_tenant_id TEXT,
  context_expires_at INTEGER
);
CREATE TABLE super_admin_login_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
CREATE TABLE super_admin_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  tenant_id TEXT,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_super_admin_audit_created ON super_admin_audit(created_at);
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0024_super_admin.sql');
