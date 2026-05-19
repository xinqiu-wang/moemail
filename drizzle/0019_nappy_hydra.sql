CREATE TABLE `verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`type` text DEFAULT 'register' NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_codes_email_idx` ON `verification_codes` (`email`);--> statement-breakpoint
CREATE INDEX `verification_codes_expires_at_idx` ON `verification_codes` (`expires_at`);