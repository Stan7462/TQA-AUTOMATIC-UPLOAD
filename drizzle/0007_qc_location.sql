ALTER TABLE qc_submissions ADD COLUMN location_status TEXT;
ALTER TABLE qc_submissions ADD COLUMN location_latitude REAL;
ALTER TABLE qc_submissions ADD COLUMN location_longitude REAL;
ALTER TABLE qc_submissions ADD COLUMN location_accuracy REAL;
ALTER TABLE qc_submissions ADD COLUMN location_captured_at INTEGER;
