ALTER TABLE qc_submissions ADD COLUMN trust_upload_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE qc_submissions ADD COLUMN trust_uploaded_at INTEGER;
ALTER TABLE qc_submissions ADD COLUMN trust_external_reference TEXT;
ALTER TABLE qc_submissions ADD COLUMN trust_upload_error TEXT;
ALTER TABLE qc_submissions ADD COLUMN trust_upload_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE qc_submissions ADD COLUMN trust_last_attempt_at INTEGER;
ALTER TABLE qc_submissions ADD COLUMN trust_uploaded_by_key_id TEXT;
CREATE INDEX idx_qc_submissions_trust_queue ON qc_submissions (status, trust_upload_status, reviewed_at, id);
CREATE TABLE trust_api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
