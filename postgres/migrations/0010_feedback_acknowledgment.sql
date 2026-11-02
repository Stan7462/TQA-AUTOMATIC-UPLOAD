ALTER TABLE qc_submissions ADD COLUMN feedback_acknowledged_at BIGINT;
ALTER TABLE qc_submission_attempts ADD COLUMN feedback_acknowledged_at BIGINT;
