import {
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { households } from './households';
import { users } from './users';

import type { ContactType } from '~/entities/contact/model/types';

/**
 * Stores one person or company available to every member of a household.
 */
export const contacts = sqliteTable(
    'contacts',
    {
        id: text('id').primaryKey(),
        householdId: text('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        type: text('type').$type<ContactType>().notNull(),
        name: text('name').notNull(),
        normalizedName: text('normalized_name').notNull(),
        legalName: text('legal_name'),
        normalizedLegalName: text('normalized_legal_name'),
        color: text('color').notNull(),
        archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
        createdByUserId: text('created_by_user_id')
            .notNull()
            .references(() => users.id),
        createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
        version: integer('version').notNull().default(1)
    },
    (table) => [
        index('contacts_household_id_archived_at_idx').on(
            table.householdId,
            table.archivedAt
        ),
        index('contacts_household_id_normalized_legal_name_idx').on(
            table.householdId,
            table.normalizedLegalName
        ),
        uniqueIndex('contacts_household_id_normalized_name_unique').on(
            table.householdId,
            table.normalizedName
        )
    ]
);

export type ContactRecord = typeof contacts.$inferSelect;
export type NewContactRecord = typeof contacts.$inferInsert;
