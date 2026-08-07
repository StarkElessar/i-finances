CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`legal_name` text,
	`normalized_legal_name` text,
	`color` text NOT NULL,
	`archived_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_household_id_archived_at_idx` ON `contacts` (`household_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `contacts_household_id_normalized_legal_name_idx` ON `contacts` (`household_id`,`normalized_legal_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_household_id_normalized_name_unique` ON `contacts` (`household_id`,`normalized_name`);