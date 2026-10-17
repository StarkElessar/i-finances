ALTER TABLE `accounts` ADD `owner` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `details` text DEFAULT '{}' NOT NULL;