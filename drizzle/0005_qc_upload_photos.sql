CREATE TABLE IF NOT EXISTS qc_upload_photos (
  submission_id TEXT NOT NULL,
  tech_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  image BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (submission_id, tech_id, slot)
);
CREATE INDEX IF NOT EXISTS qc_upload_photos_created_at_idx ON qc_upload_photos (created_at);
