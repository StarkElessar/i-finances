ALTER TABLE `users` ADD `first_household_owner_at` integer;--> statement-breakpoint
-- The right to found a household (development/decisions/app-invitations-v1.md, section 13). A nullable column without a
-- default: SQLite only appends it to the DDL of users, no row is rewritten and the table is not rebuilt. The step below
-- only fills it in, it never changes any other column or row.
-- Every current owner, from their owner membership. Nobody else: a former owner is not guessed from the household
-- invitations they created, because a person demoted to member by hand must not get the right back (owner's decision
-- 2026-10-23).
UPDATE `users`
SET `first_household_owner_at` = (
	SELECT min(`household_members`.`joined_at`) FROM `household_members`
	WHERE `household_members`.`user_id` = `users`.`id` AND `household_members`.`role` = 'owner'
)
WHERE EXISTS (
	SELECT 1 FROM `household_members`
	WHERE `household_members`.`user_id` = `users`.`id` AND `household_members`.`role` = 'owner'
);
