ALTER TABLE `qc_submissions` ADD `job_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `qc_submissions` ADD `review_note` text;--> statement-breakpoint
CREATE INDEX `idx_qc_submissions_tech_submitted` ON `qc_submissions` (`tech_id`,`submitted_at`);