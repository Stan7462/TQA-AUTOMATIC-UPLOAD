ALTER TABLE technicians ADD COLUMN monthly_qc_goal INTEGER CHECK (monthly_qc_goal BETWEEN 1 AND 99);
INSERT OR IGNORE INTO local_migrations(name) VALUES ('0016_technician_monthly_qc_goal.sql');
