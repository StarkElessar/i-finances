PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transfers` (
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
	CONSTRAINT "transfers_positive_from_amount_check" CHECK("__new_transfers"."from_amount_minor" > 0),
	CONSTRAINT "transfers_positive_to_amount_check" CHECK("__new_transfers"."to_amount_minor" > 0),
	CONSTRAINT "transfers_different_accounts_check" CHECK("__new_transfers"."from_account_id" <> "__new_transfers"."to_account_id")
);
--> statement-breakpoint
INSERT INTO `__new_transfers`("id", "household_id", "from_account_id", "to_account_id", "from_amount_minor", "to_amount_minor", "exchange_from_currency", "exchange_to_currency", "exchange_rate", "happened_on", "comment", "contact_id", "contact_name_snapshot", "deleted_at", "deleted_by_user_id", "created_by_user_id", "updated_by_user_id", "created_at", "updated_at", "version") SELECT "id", "household_id", "from_account_id", "to_account_id", "from_amount_minor", "to_amount_minor", "exchange_from_currency", "exchange_to_currency", "exchange_rate", "happened_on", "comment", "contact_id", "contact_name_snapshot", "deleted_at", "deleted_by_user_id", "created_by_user_id", "updated_by_user_id", "created_at", "updated_at", "version" FROM `transfers`;--> statement-breakpoint
DROP TABLE `transfers`;--> statement-breakpoint
ALTER TABLE `__new_transfers` RENAME TO `transfers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transfers_household_deleted_idx` ON `transfers` (`household_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `transfers_household_from_account_idx` ON `transfers` (`household_id`,`from_account_id`);--> statement-breakpoint
CREATE INDEX `transfers_household_to_account_idx` ON `transfers` (`household_id`,`to_account_id`);