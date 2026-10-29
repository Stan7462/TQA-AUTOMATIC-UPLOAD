ALTER TABLE qc_submissions ADD COLUMN rejection_upload_mode TEXT NOT NULL DEFAULT 'catalyst' CHECK (rejection_upload_mode IN ('catalyst', 'local'));
ALTER TABLE qc_submission_attempts ADD COLUMN rejection_upload_mode TEXT NOT NULL DEFAULT 'catalyst' CHECK (rejection_upload_mode IN ('catalyst', 'local'));
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0026_local_rejection.sql');
