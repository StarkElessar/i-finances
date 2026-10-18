-- One household per user (development/decisions/telegram-auth-and-households-v1.md, DB-3).
-- If some user already has two memberships, CREATE UNIQUE INDEX fails with
-- "UNIQUE constraint failed: household_members.user_id" and the migrator rolls back the
-- whole run (all pending migrations share one transaction): nothing is changed or lost and
-- the API does not start. The duplicates are resolved by hand on the owner's word, see
-- development/decisions/schema-migrations-v1.md.
DROP INDEX `household_members_user_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_user_id_unique` ON `household_members` (`user_id`);--> statement-breakpoint
-- Users without a membership used to be provisioned as owners of default-household on first
-- access. That auto-provisioning goes away, so they join it now, as members. Existing roles
-- are not changed. Nothing happens when default-household does not exist.
INSERT INTO `household_members` (`household_id`, `user_id`, `role`, `joined_at`)
SELECT 'default-household', `users`.`id`, 'member', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `users`
WHERE EXISTS (SELECT 1 FROM `households` WHERE `households`.`id` = 'default-household')
	AND NOT EXISTS (SELECT 1 FROM `household_members` WHERE `household_members`.`user_id` = `users`.`id`);
