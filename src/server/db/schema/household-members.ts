import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text
} from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

export type HouseholdMemberRole = 'member' | 'owner';

/**
 * Grants one authenticated user access to one household.
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
		index('household_members_user_id_idx').on(table.userId)
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
