CREATE TABLE `qc_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`tech_id` text NOT NULL,
	`screenshot_id` text NOT NULL,
	`photo_ids` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_qc_submissions_status_submitted` ON `qc_submissions` (`status`,`submitted_at`);