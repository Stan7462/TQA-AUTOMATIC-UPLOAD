ALTER TABLE qc_submissions ADD COLUMN rejection_upload_mode TEXT NOT NULL DEFAULT 'catalyst' CHECK (rejection_upload_mode IN ('catalyst', 'local'));
ALTER TABLE qc_submission_attempts ADD COLUMN rejection_upload_mode TEXT NOT NULL DEFAULT 'catalyst' CHECK (rejection_upload_mode IN ('catalyst', 'local'));
