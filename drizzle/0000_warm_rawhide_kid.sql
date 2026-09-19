CREATE TABLE `tech_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`tech_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tech_id`) REFERENCES `technicians`(`tech_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `technicians` (
	`tech_id` text PRIMARY KEY NOT NULL,
	`pin_salt` text NOT NULL,
	`pin_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
