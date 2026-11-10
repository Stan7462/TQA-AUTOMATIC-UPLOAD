CREATE TABLE qc_deletions (
  tenant_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  current_submission_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  job_number TEXT NOT NULL,
  deleted_by TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, root_submission_id)
);
CREATE TABLE qc_deleted_ids (
  tenant_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, submission_id)
);
CREATE TABLE qc_deleted_photos (
  tenant_id TEXT NOT NULL,
  root_submission_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, root_submission_id, photo_id)
);
