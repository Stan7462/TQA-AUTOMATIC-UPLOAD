ALTER TABLE tenants ADD COLUMN catalyst_include_screenshot INTEGER NOT NULL DEFAULT 1;
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0025_catalyst_screenshot.sql');
