ALTER TABLE qc_submissions ADD COLUMN address TEXT;
ALTER TABLE qc_submission_attempts ADD COLUMN address TEXT;
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0021_qc_address.sql');
