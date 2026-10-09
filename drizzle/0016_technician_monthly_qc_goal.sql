ALTER TABLE technicians ADD COLUMN monthly_qc_goal INTEGER CHECK (monthly_qc_goal BETWEEN 1 AND 99);
