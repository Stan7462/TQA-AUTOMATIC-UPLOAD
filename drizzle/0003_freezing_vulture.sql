CREATE TABLE `technician_removals` (
	`tech_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'deleting' NOT NULL,
	`started_at` integer NOT NULL
);
