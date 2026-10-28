ALTER TABLE qc_submissions ADD COLUMN catalyst_observation_type TEXT;
ALTER TABLE qc_submission_attempts ADD COLUMN catalyst_observation_type TEXT;
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0023_catalyst_observation_type.sql');
