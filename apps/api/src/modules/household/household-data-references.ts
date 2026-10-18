import type { AppTransaction } from '@/infrastructure/database/client';
import {
	accounts,
	categories,
	contacts,
	operations,
	receiptImports,
	transfers
} from '@/infrastructure/database/schema';

import { eq, notExists, type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

export type HouseholdDataReference = { column: SQLiteColumn; table: SQLiteTable };

/**
 * Every table with finance data of a household, by its `household_id` (the «empty household» of Р5: no accounts,
 * operations, transfers, receipts, contacts or categories). Deleting a household cascades into all of them, so a
 * household is deleted only when each of them is empty for it: when an empty duplicate is merged (Р9) and when the
 * only member of an empty household accepts an invitation (Р5). Checked against the schema by
 * `telegram-link-http.test.ts`: every table that references `households`, except the membership and the invitations,
 * must be here.
 */
export const HOUSEHOLD_DATA_REFERENCES: readonly HouseholdDataReference[] = [
	{ column: accounts.householdId, table: accounts },
	{ column: categories.householdId, table: categories },
	{ column: contacts.householdId, table: contacts },
	{ column: operations.householdId, table: operations },
	{ column: receiptImports.householdId, table: receiptImports },
	{ column: transfers.householdId, table: transfers }
];

/** Whether any finance data of the household exists, read inside the caller's transaction. */
export function householdHasData(transaction: AppTransaction, householdId: string): boolean {
	return HOUSEHOLD_DATA_REFERENCES.some(({ column, table }) => transaction.select({ one: sql`1` })
		.from(table)
		.where(eq(column, householdId))
		.limit(1)
		.get() !== undefined);
}

/** The same rule as `NOT EXISTS` conditions, for the deleting statement itself. */
export function householdHasNoDataConditions(transaction: AppTransaction, householdId: string): SQL[] {
	return HOUSEHOLD_DATA_REFERENCES.map(({ column, table }) => notExists(transaction.select({ one: sql`1` })
		.from(table)
		.where(eq(column, householdId))));
}
