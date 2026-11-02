ALTER TABLE push_company_preferences ADD COLUMN watch_upload_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_fixed_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_upload_since INTEGER NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_fixed_since INTEGER NOT NULL DEFAULT 0;
