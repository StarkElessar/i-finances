ALTER TABLE `users` ADD `first_household_owner_at` integer;--> statement-breakpoint
-- The right to found a household (development/decisions/app-invitations-v1.md, section 13). A nullable column without a
-- default: SQLite only appends it to the DDL of users, no row is rewritten and the table is not rebuilt. The two steps
-- below only fill it in, they never change any other column or row.
-- 1. Every current owner, from their owner membership.
UPDATE `users`
SET `first_household_owner_at` = (
	SELECT min(`household_members`.`joined_at`) FROM `household_members`
	WHERE `household_members`.`user_id` = `users`.`id` AND `household_members`.`role` = 'owner'
)
WHERE EXISTS (
	SELECT 1 FROM `household_members`
	WHERE `household_members`.`user_id` = `users`.`id` AND `household_members`.`role` = 'owner'
);--> statement-breakpoint
-- 2. Former owners that are no owners any more: only an owner can create a household invitation (the insert checks it
-- in its own transaction since the table exists), so its creator was an owner at that moment. Its time is used.
UPDATE `users`
SET `first_household_owner_at` = (
	SELECT min(`household_invitations`.`created_at`) FROM `household_invitations`
	WHERE `household_invitations`.`created_by_user_id` = `users`.`id`
)
WHERE `first_household_owner_at` IS NULL AND EXISTS (
	SELECT 1 FROM `household_invitations` WHERE `household_invitations`.`created_by_user_id` = `users`.`id`
);
