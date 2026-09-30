-- The shared login domain searches matching IDs, then identifies the tenant by the credential.
CREATE INDEX IF NOT EXISTS idx_technicians_global_tech_id ON technicians(tech_id);

INSERT OR IGNORE INTO local_migrations(name) VALUES ('0009_shared_domain_login.sql');
