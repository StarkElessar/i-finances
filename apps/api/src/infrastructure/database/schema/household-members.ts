import {
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

export type HouseholdMemberRole = 'member' | 'owner';

/**
 * Grants one authenticated user access to one household.
 *
 * A user belongs to at most one household: the unique index on `user_id`
 * enforces it in the schema, not only in code.
 */
export const householdMembers = sqliteTable(
	'household_members',
	{
		householdId: text('household_id')
			.notNull()
			.references(() => households.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		role: text('role').$type<HouseholdMemberRole>().notNull(),
		joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull()
	},
	(table) => [
		primaryKey({
			columns: [table.householdId, table.userId],
			name: 'household_members_household_id_user_id_pk'
		}),
		uniqueIndex('household_members_user_id_unique').on(table.userId)
	]
);

/**
 * Database row returned for a household member.
 */
export type HouseholdMemberRecord = typeof householdMembers.$inferSelect;

/**
 * Values accepted when adding a household member.
 */
export type NewHouseholdMemberRecord = typeof householdMembers.$inferInsert;
