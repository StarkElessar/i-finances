CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`type` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`amount_in_household_base_currency_minor` integer NOT NULL,
	`household_base_currency` text NOT NULL,
	`happened_on` text NOT NULL,
	`source_order` integer NOT NULL,
	`title` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`category_id` text,
	`category_name_snapshot` text,
	`contact_id` text,
	`contact_name_snapshot` text,
	`exchange_rate` text NOT NULL,
	`exchange_rate_effective_on` text NOT NULL,
	`exchange_rate_source` text NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "operations_type_check" CHECK("operations"."type" IN ('expense', 'income')),
	CONSTRAINT "operations_positive_amount_check" CHECK("operations"."amount_minor" > 0),
	CONSTRAINT "operations_positive_base_amount_check" CHECK("operations"."amount_in_household_base_currency_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_account_date_source_order_unique` ON `operations` (`account_id`,`happened_on`,`source_order`);--> statement-breakpoint
CREATE INDEX `operations_account_deleted_date_order_idx` ON `operations` (`account_id`,`deleted_at`,`happened_on`,`source_order`);--> statement-breakpoint
CREATE INDEX `operations_household_category_deleted_date_idx` ON `operations` (`household_id`,`category_id`,`deleted_at`,`happened_on`);--> statement-breakpoint
CREATE INDEX `operations_household_contact_deleted_date_idx` ON `operations` (`household_id`,`contact_id`,`deleted_at`,`happened_on`);--> statement-breakpoint
CREATE INDEX `operations_household_deleted_idx` ON `operations` (`household_id`,`deleted_at`);