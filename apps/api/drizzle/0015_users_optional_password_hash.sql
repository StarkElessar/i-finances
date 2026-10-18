PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- users.password_hash becomes NULL-able (development/decisions/telegram-auth-and-households-v1.md, DB-2).
-- SQLite rebuilds the table: create new, copy, drop old, rename. With foreign keys ON, the DROP
-- would cascade into sessions, passkeys, challenges and memberships and silently delete them. The
-- PRAGMA above is a no-op inside the migrator's transaction, so foreign keys must be switched off
-- before it starts (applyMigrations, used by scripts/migrate-db.ts, does that). This guard stops
-- the migration on a non-empty database when they are still on, e.g. under `drizzle-kit migrate`.
CREATE TEMP TABLE `__users_rebuild_guard` (
	`foreign_keys_on` integer,
	CONSTRAINT "users_rebuild_requires_foreign_keys_off_use_apply_migrations" CHECK(`foreign_keys_on` = 0)
);
--> statement-breakpoint
INSERT INTO `__users_rebuild_guard` SELECT 1 WHERE (SELECT `foreign_keys` FROM pragma_foreign_keys) = 1 AND EXISTS (SELECT 1 FROM `users`);--> statement-breakpoint
DROP TABLE `__users_rebuild_guard`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "display_name", "password_hash", "is_active", "created_at", "updated_at") SELECT "id", "username", "display_name", "password_hash", "is_active", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);