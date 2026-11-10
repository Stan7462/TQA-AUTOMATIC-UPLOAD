CREATE TABLE qc_job_number_changes (
  change_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  old_job_number TEXT NOT NULL,
  new_job_number TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  PRIMARY KEY (change_id, submission_id)
);
CREATE INDEX idx_qc_job_number_changes_root ON qc_job_number_changes(tenant_id, root_submission_id, changed_at);
