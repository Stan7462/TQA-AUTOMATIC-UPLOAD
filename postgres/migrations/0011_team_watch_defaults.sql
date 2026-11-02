ALTER TABLE push_company_preferences ADD COLUMN watch_upload_enabled BIGINT NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_fixed_enabled BIGINT NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_upload_since BIGINT NOT NULL DEFAULT 0;
ALTER TABLE push_company_preferences ADD COLUMN watch_fixed_since BIGINT NOT NULL DEFAULT 0;
