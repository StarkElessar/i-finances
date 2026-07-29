CREATE TABLE `exchange_rate_refreshes` (
	`id` text PRIMARY KEY NOT NULL,
	`base_currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`requested_on` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rate_refreshes_source_base_requested_unique` ON `exchange_rate_refreshes` (`source`,`base_currency`,`requested_on`);