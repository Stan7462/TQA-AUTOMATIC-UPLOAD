ALTER TABLE qc_submissions ADD COLUMN feedback_acknowledged_at INTEGER;
ALTER TABLE qc_submission_attempts ADD COLUMN feedback_acknowledged_at INTEGER;
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0027_feedback_acknowledgment.sql');
