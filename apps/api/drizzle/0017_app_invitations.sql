CREATE TABLE `app_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`note` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by_user_id` text,
	`revoked_at` integer,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_invitations_token_hash_unique` ON `app_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `app_invitations_created_at_idx` ON `app_invitations` (`created_at`);--> statement-breakpoint
ALTER TABLE `household_invitations` ADD `registered_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `telegram_login_requests` ADD `invitation_token_hash` text;