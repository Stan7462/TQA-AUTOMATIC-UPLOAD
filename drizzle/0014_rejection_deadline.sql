ALTER TABLE qc_submissions ADD COLUMN correction_deadline_at INTEGER;

UPDATE qc_submissions
SET correction_deadline_at = (unixepoch('now') * 1000) + 259200000
WHERE status = 'rejected' AND correction_pending = 0;

INSERT OR IGNORE INTO local_migrations(name) VALUES ('0014_rejection_deadline.sql');
