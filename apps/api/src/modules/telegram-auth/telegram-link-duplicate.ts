import type { AppDatabase } from '@/infrastructure/database/client';
import {
	accounts,
	categories,
	contacts,
	householdInvitations,
	householdMembers,
	households,
	operations,
	receiptImports,
	sessions,
	telegramAccounts,
	telegramLoginRequests,
	transfers,
	users,
	webauthnChallenges,
	webauthnCredentials
} from '@/infrastructure/database/schema';
// The «empty household» rule is the household module's: the invitation acceptance (Р5) applies the same list.
import { HOUSEHOLD_DATA_REFERENCES } from '@/modules/household';

import { and, eq, isNull, ne, notExists, type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import type { TelegramIdentity } from './telegram-identity';

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

/** The fields Telegram reports, refreshed on every link like on every sign-in. */
export function telegramIdentityColumns(identity: TelegramIdentity, now: Date) {
	return {
		botBlockedAt: null,
		chatId: identity.chatId,
		firstName: identity.firstName,
		lastName: identity.lastName,
		updatedAt: now,
		username: identity.username
	};
}

/** Changed nothing although the rules said it would: give up the whole transaction, the request included. */
export function requireOneRow(transaction: TelegramLinkTransaction, changes: number): void {
	if (changes !== 1) {
		transaction.rollback();
	}
}

export type MergeDuplicateInput = {
	/** From `assessDuplicate`: the household the duplicate is alone in, or `null` without one. */
	duplicateHouseholdId: string | null;
	duplicateUserId: string;
	identity: TelegramIdentity;
	linkUserId: string;
	now: Date;
};

/**
 * Removes the empty duplicate that held the Telegram account and moves the account to `linkUserId`, inside the link
 * transaction. The second line of defence after `assessDuplicate`: every deleting statement repeats the rules as its
 * own conditions (alone in a household without data, no password hash, active, no passkey, no membership left, no
 * authorship) and must change exactly one row, otherwise `transaction.rollback()` undoes everything, the request
 * included. So nothing with data is deleted even if a rule were missed above. Cascades are not relied upon: the
 * membership, sessions, challenges and link requests of the duplicate are deleted explicitly.
 */
export function mergeDuplicate(transaction: TelegramLinkTransaction, input: MergeDuplicateInput): void {
	const { duplicateHouseholdId, duplicateUserId, identity, linkUserId, now } = input;
	const one = sql`1`;

	if (duplicateHouseholdId !== null) {
		const left = transaction.delete(householdMembers)
			.where(and(eq(householdMembers.householdId, duplicateHouseholdId), eq(householdMembers.userId, duplicateUserId)))
			.run();

		requireOneRow(transaction, left.changes);

		const deletedHousehold = transaction.delete(households)
			.where(and(
				eq(households.id, duplicateHouseholdId),
				notExists(transaction.select({ one }).from(householdMembers).where(eq(householdMembers.householdId, duplicateHouseholdId))),
				...notReferencedBy(transaction, HOUSEHOLD_DATA_REFERENCES, duplicateHouseholdId)
			))
			.run();

		requireOneRow(transaction, deletedHousehold.changes);
	}

	transaction.delete(sessions).where(eq(sessions.userId, duplicateUserId)).run();
	transaction.delete(webauthnChallenges).where(eq(webauthnChallenges.userId, duplicateUserId)).run();
	transaction.delete(telegramLoginRequests).where(eq(telegramLoginRequests.linkUserId, duplicateUserId)).run();

	const moved = transaction.update(telegramAccounts)
		.set({ ...telegramIdentityColumns(identity, now), linkedAt: now, userId: linkUserId })
		.where(and(eq(telegramAccounts.userId, duplicateUserId), eq(telegramAccounts.telegramId, identity.telegramId)))
		.run();

	requireOneRow(transaction, moved.changes);

	const deletedUser = transaction.delete(users)
		.where(and(
			eq(users.id, duplicateUserId),
			isNull(users.passwordHash),
			eq(users.isActive, true),
			notExists(transaction.select({ one }).from(webauthnCredentials).where(eq(webauthnCredentials.userId, duplicateUserId))),
			notExists(transaction.select({ one }).from(householdMembers).where(eq(householdMembers.userId, duplicateUserId))),
			...notReferencedBy(transaction, USER_AUTHORSHIP_REFERENCES, duplicateUserId)
		))
		.run();

	requireOneRow(transaction, deletedUser.changes);
}
