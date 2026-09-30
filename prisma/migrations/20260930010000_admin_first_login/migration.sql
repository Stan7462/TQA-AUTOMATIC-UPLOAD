ALTER TABLE technicians ADD COLUMN must_change_credentials INTEGER NOT NULL DEFAULT 0;
ALTER TABLE technicians ADD COLUMN credential_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS technicians_credential_fingerprint_key ON technicians(credential_fingerprint);

INSERT OR IGNORE INTO local_migrations(name) VALUES ('0010_admin_first_login.sql');
