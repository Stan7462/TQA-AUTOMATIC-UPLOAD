ALTER TABLE qc_submissions ADD COLUMN root_submission_id TEXT;
ALTER TABLE qc_submissions ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE qc_submissions ADD COLUMN correction_pending INTEGER NOT NULL DEFAULT 0;

UPDATE qc_submissions SET root_submission_id = id WHERE root_submission_id IS NULL;

CREATE INDEX idx_qc_submissions_tenant_corrections
  ON qc_submissions(tenant_id, status, correction_pending, submitted_at);

CREATE TABLE qc_submission_attempts (
  tenant_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  tech_id TEXT NOT NULL,
  job_number TEXT NOT NULL,
  screenshot_id TEXT NOT NULL,
  photo_ids TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  review_note TEXT,
  trust_upload_status TEXT NOT NULL DEFAULT 'ready',
  trust_uploaded_at INTEGER,
  trust_external_reference TEXT,
  trust_upload_error TEXT,
  trust_upload_attempts INTEGER NOT NULL DEFAULT 0,
  trust_last_attempt_at INTEGER,
  trust_uploaded_by_key_id TEXT,
  location_status TEXT,
  location_latitude REAL,
  location_longitude REAL,
  location_accuracy REAL,
  location_captured_at INTEGER,
  PRIMARY KEY (tenant_id, root_submission_id, attempt_number)
);

CREATE INDEX idx_qc_submission_attempts_root
  ON qc_submission_attempts(tenant_id, root_submission_id, attempt_number);
CREATE INDEX idx_qc_submission_attempts_submitted
  ON qc_submission_attempts(tenant_id, submitted_at);

INSERT OR IGNORE INTO local_migrations(name) VALUES ('0013_qc_attempts.sql');
