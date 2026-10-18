CREATE TABLE `household_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invitations_token_hash_unique` ON `household_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `household_invitations_household_id_idx` ON `household_invitations` (`household_id`);--> statement-breakpoint
CREATE TABLE `telegram_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`telegram_id` text NOT NULL,
	`username` text,
	`first_name` text NOT NULL,
	`last_name` text,
	`chat_id` text NOT NULL,
	`bot_blocked_at` integer,
	`linked_at` integer NOT NULL,
	`last_sign_in_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_accounts_telegram_id_unique` ON `telegram_accounts` (`telegram_id`);--> statement-breakpoint
CREATE TABLE `telegram_login_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`secret_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`link_user_id` text,
	`status` text NOT NULL,
	`telegram_id` text,
	`username` text,
	`first_name` text,
	`last_name` text,
	`chat_id` text,
	`user_agent` text,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	`used_at` integer,
	FOREIGN KEY (`link_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_login_requests_code_unique` ON `telegram_login_requests` (`code`);--> statement-breakpoint
CREATE INDEX `telegram_login_requests_expires_at_idx` ON `telegram_login_requests` (`expires_at`);