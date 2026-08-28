CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`from_amount_minor` integer NOT NULL,
	`to_amount_minor` integer NOT NULL,
	`exchange_from_currency` text NOT NULL,
	`exchange_to_currency` text NOT NULL,
	`exchange_rate` text NOT NULL,
	`happened_on` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`contact_id` text,
	`contact_name_snapshot` text,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfers_positive_from_amount_check" CHECK("transfers"."from_amount_minor" > 0),
	CONSTRAINT "transfers_positive_to_amount_check" CHECK("transfers"."to_amount_minor" > 0),
	CONSTRAINT "transfers_different_accounts_check" CHECK("transfers"."from_account_id" <> "transfers"."to_account_id"),
	CONSTRAINT "transfers_different_currencies_check" CHECK("transfers"."exchange_from_currency" <> "transfers"."exchange_to_currency")
);
--> statement-breakpoint
CREATE INDEX `transfers_household_deleted_idx` ON `transfers` (`household_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `transfers_household_from_account_idx` ON `transfers` (`household_id`,`from_account_id`);--> statement-breakpoint
CREATE INDEX `transfers_household_to_account_idx` ON `transfers` (`household_id`,`to_account_id`);--> statement-breakpoint
ALTER TABLE `operations` ADD `transfer_id` text REFERENCES transfers(id);--> statement-breakpoint
CREATE INDEX `operations_household_transfer_idx` ON `operations` (`household_id`,`transfer_id`);