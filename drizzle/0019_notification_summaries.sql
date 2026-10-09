ALTER TABLE push_accounts ADD COLUMN supervisor_summary INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_accounts ADD COLUMN escalation INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_accounts ADD COLUMN device_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE push_accounts ADD COLUMN device_checked_at INTEGER;
ALTER TABLE push_watches ADD COLUMN upload_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_watches ADD COLUMN fixed_enabled INTEGER NOT NULL DEFAULT 0;
