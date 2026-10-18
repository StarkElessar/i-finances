import type { AppDatabase } from '@/infrastructure/database/client';
import {
	accounts,
	categories,
	contacts,
	householdInvitations,
	householdMembers,
	operations,
	receiptImports,
	transfers,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';

import { and, eq, ne, notExists, type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

/** The handle every statement of one link transaction runs on. */
export type TelegramLinkTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

type Reference = { column: SQLiteColumn; table: SQLiteTable };

/**
 * Every column that points at `users` **without** `ON DELETE CASCADE`: authorship of household data. A user who
 * appears in any of them has left a trace in the finances and is never deleted (Р7). Kept as a list on purpose and
 * checked against the schema by `telegram-link-http.test.ts` («every non-cascading reference to users is listed»), so
 * a new table cannot silently make a duplicate with data look empty.
 */
export const USER_AUTHORSHIP_REFERENCES: readonly Reference[] = [
	{ column: accounts.createdByUserId, table: accounts },
	{ column: categories.createdByUserId, table: categories },
	{ column: contacts.createdByUserId, table: contacts },
	{ column: householdInvitations.createdByUserId, table: householdInvitations },
	{ column: householdInvitations.acceptedByUserId, table: householdInvitations },
	{ column: operations.createdByUserId, table: operations },
	{ column: operations.updatedByUserId, table: operations },
	{ column: operations.deletedByUserId, table: operations },
	{ column: receiptImports.createdByUserId, table: receiptImports },
	{ column: transfers.createdByUserId, table: transfers },
	{ column: transfers.updatedByUserId, table: transfers },
	{ column: transfers.deletedByUserId, table: transfers }
];

/**
 * Every table with finance data of a household, by its `household_id` (the «empty household» of Р5: no accounts,
 * operations, transfers, receipts, contacts or categories). Deleting a household cascades into all of them, so a
 * household is deleted only when each of them is empty for it. Checked against the schema by the same test: every
 * table that references `households`, except the membership and the invitations, must be here.
 */
export const HOUSEHOLD_DATA_REFERENCES: readonly Reference[] = [
	{ column: accounts.householdId, table: accounts },
	{ column: categories.householdId, table: categories },
	{ column: contacts.householdId, table: contacts },
	{ column: operations.householdId, table: operations },
	{ column: receiptImports.householdId, table: receiptImports },
	{ column: transfers.householdId, table: transfers }
];

/**
 * What linking would do with the other user that holds the Telegram account (Р9):
 * - `mergeable`: an empty duplicate (no password, no passkeys, active, no trace in any finance data, and either no
 *   household or the only member of a household without data). It and its empty household go, the Telegram moves.
 * - `has-data`: anything else. The link is refused with 409 and nothing changes.
 */
export type DuplicateAssessment =
	| { householdId: string | null; kind: 'mergeable' }
	| { kind: 'has-data' };

function referencedBy(transaction: TelegramLinkTransaction, references: readonly Reference[], id: string): boolean {
	return references.some(({ column, table }) => transaction.select({ one: sql`1` })
		.from(table)
		.where(eq(column, id))
		.limit(1)
		.get() !== undefined);
}

/** `NOT EXISTS` for each reference: the same rules again, as conditions of the deleting statement itself. */
export function notReferencedBy(transaction: TelegramLinkTransaction, references: readonly Reference[], id: string): SQL[] {
	return references.map(({ column, table }) => notExists(transaction.select({ one: sql`1` }).from(table).where(eq(column, id))));
}

/**
 * Decides, inside the link transaction, whether `userId` (the current holder of the Telegram account, never the user
 * who links) is an empty duplicate. Strict on purpose: any password hash at all (not only a usable one), any passkey,
 * a deactivated account, any authored row anywhere, another member in its household or any data there: `has-data`.
 */
export function assessDuplicate(transaction: TelegramLinkTransaction, userId: string): DuplicateAssessment {
	const user = transaction.select({ isActive: users.isActive, passwordHash: users.passwordHash })
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (user === undefined || user.passwordHash !== null || !user.isActive) {
		return { kind: 'has-data' };
	}

	const hasPasskey = transaction.select({ one: sql`1` })
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.userId, userId))
		.limit(1)
		.get() !== undefined;

	if (hasPasskey || referencedBy(transaction, USER_AUTHORSHIP_REFERENCES, userId)) {
		return { kind: 'has-data' };
	}

	const membership = transaction.select({ householdId: householdMembers.householdId })
		.from(householdMembers)
		.where(eq(householdMembers.userId, userId))
		.get();

	if (membership === undefined) {
		return { householdId: null, kind: 'mergeable' };
	}

	const otherMember = transaction.select({ one: sql`1` })
		.from(householdMembers)
		.where(and(eq(householdMembers.householdId, membership.householdId), ne(householdMembers.userId, userId)))
		.limit(1)
		.get();

	if (otherMember !== undefined || referencedBy(transaction, HOUSEHOLD_DATA_REFERENCES, membership.householdId)) {
		return { kind: 'has-data' };
	}

	return { householdId: membership.householdId, kind: 'mergeable' };
}
