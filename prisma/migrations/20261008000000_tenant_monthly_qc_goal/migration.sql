ALTER TABLE "tenants" ADD COLUMN "monthly_qc_goal" INTEGER NOT NULL DEFAULT 5;
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0015_tenant_monthly_qc_goal.sql');
