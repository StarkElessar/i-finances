CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`color` text NOT NULL,
	`monthly_budget_minor` integer,
	`archived_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_household_id_archived_at_idx` ON `categories` (`household_id`,`archived_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_household_id_normalized_name_unique` ON `categories` (`household_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `category_keywords` (
	`category_id` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`category_id`, `normalized_value`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `category_keywords_category_id_position_idx` ON `category_keywords` (`category_id`,`position`);