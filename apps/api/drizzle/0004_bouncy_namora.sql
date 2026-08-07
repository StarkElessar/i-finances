CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`rate` text NOT NULL,
	`effective_on` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "exchange_rates_different_currencies_check" CHECK("exchange_rates"."from_currency" <> "exchange_rates"."to_currency")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_pair_effective_on_unique` ON `exchange_rates` (`from_currency`,`to_currency`,`effective_on`);