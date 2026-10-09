ALTER TABLE push_accounts ADD COLUMN supervisor_summary BIGINT NOT NULL DEFAULT 1;
ALTER TABLE push_accounts ADD COLUMN escalation BIGINT NOT NULL DEFAULT 1;
ALTER TABLE push_accounts ADD COLUMN device_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE push_accounts ADD COLUMN device_checked_at BIGINT;
ALTER TABLE push_watches ADD COLUMN upload_enabled BIGINT NOT NULL DEFAULT 1;
ALTER TABLE push_watches ADD COLUMN fixed_enabled BIGINT NOT NULL DEFAULT 0;
