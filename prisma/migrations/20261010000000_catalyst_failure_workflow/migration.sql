ALTER TABLE qc_submissions ADD COLUMN catalyst_failures TEXT;
ALTER TABLE qc_submissions ADD COLUMN trust_upload_kind TEXT NOT NULL DEFAULT 'observation';
ALTER TABLE qc_submissions ADD COLUMN catalyst_observation_id TEXT;
ALTER TABLE qc_submission_attempts ADD COLUMN catalyst_failures TEXT;
ALTER TABLE qc_submission_attempts ADD COLUMN trust_upload_kind TEXT NOT NULL DEFAULT 'observation';
ALTER TABLE qc_submission_attempts ADD COLUMN catalyst_observation_id TEXT;

CREATE INDEX idx_qc_submissions_tenant_workflow ON qc_submissions(tenant_id, trust_upload_kind, trust_upload_status, reviewed_at, id);

INSERT OR IGNORE INTO local_migrations(name) VALUES ('0022_catalyst_failure_workflow.sql');
