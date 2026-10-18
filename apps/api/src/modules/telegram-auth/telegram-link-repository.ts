import type { AppDatabase } from '@/infrastructure/database/client';
import { telegramAccounts, telegramLoginRequests } from '@/infrastructure/database/schema';

import { and, eq, gt, TransactionRollbackError } from 'drizzle-orm';

import type { TelegramIdentity } from './telegram-identity';
import {
	assessDuplicate,
	mergeDuplicate,
	requireOneRow,
	telegramIdentityColumns,
	type TelegramLinkTransaction
} from './telegram-link-duplicate';

/**
 * What linking `telegramId` to `linkUserId` would do right now (Р9):
 * - `free`: nobody has this Telegram, it gets linked;
 * - `already-linked`: it is already this user's Telegram (idempotent: details are refreshed);
 * - `account-has-telegram`: the user already has another Telegram (409);
 * - `merge`: an empty duplicate holds it; the duplicate goes and the Telegram moves to the user;
 * - `telegram-linked-elsewhere`: another user with data holds it (409).
 */
export type TelegramLinkAssessment =
	| { kind: 'account-has-telegram' }
	| { kind: 'already-linked' }
	| { kind: 'free' }
	| { duplicateHouseholdId: string | null; duplicateUserId: string; kind: 'merge' }
	| { kind: 'telegram-linked-elsewhere' };

export type TelegramLinkCompletion =
	/** The request was not `confirmed`, alive, a link of this user and of this browser: nothing happened. */
	| { kind: 'not-consumed' }
	| { kind: 'linked'; mergedUserId: string | null; username: string | null }
	| { kind: 'account-has-telegram' }
	| { kind: 'telegram-linked-elsewhere' };

export type CompleteTelegramLinkInput = {
	/** The signed-in user; must be the `link_user_id` of the request. */
	linkUserId: string;
	now: Date;
	requestId: string;
	/** Hash of the secret from the cookie of the polling browser; must be the request's. */
	secretHash: string;
};

function assessLink(transaction: TelegramLinkTransaction, linkUserId: string, telegramId: string): TelegramLinkAssessment {
	const own = transaction.select({ telegramId: telegramAccounts.telegramId })
		.from(telegramAccounts)
		.where(eq(telegramAccounts.userId, linkUserId))
		.get();

	if (own !== undefined) {
		return own.telegramId === telegramId ? { kind: 'already-linked' } : { kind: 'account-has-telegram' };
	}

	const holder = transaction.select({ userId: telegramAccounts.userId })
		.from(telegramAccounts)
		.where(eq(telegramAccounts.telegramId, telegramId))
		.get();

	if (holder === undefined) {
		return { kind: 'free' };
	}

	const duplicate = assessDuplicate(transaction, holder.userId);

	return duplicate.kind === 'mergeable'
		? { duplicateHouseholdId: duplicate.householdId, duplicateUserId: holder.userId, kind: 'merge' }
		: { kind: 'telegram-linked-elsewhere' };
}

/**
 * Linking Telegram to an existing user and merging an empty duplicate (Р9, flow 5.3). One synchronous transaction
 * consumes the request and applies the outcome, so a link is decided once: a second poll, a parallel link of the same
 * Telegram to someone else, or a redelivered update all find the request already `used` or the Telegram already taken.
 */
export class TelegramLinkRepository {
	public constructor(private readonly database: AppDatabase) {}

	/**
	 * Read only, for the bot's answer after «Привязать»: the browser learns the same at `complete`, which decides again
	 * inside its own transaction and never relies on this.
	 */
	public async assess(linkUserId: string, telegramId: string): Promise<TelegramLinkAssessment> {
		return this.database.transaction((transaction) => assessLink(transaction, linkUserId, telegramId));
	}

	public async complete(input: CompleteTelegramLinkInput): Promise<TelegramLinkCompletion> {
		try {
			return this.database.transaction((transaction): TelegramLinkCompletion => {
				// `confirmed → used`, only for a live link request of this very user started by this very browser.
				const consumed = transaction.update(telegramLoginRequests)
					.set({ status: 'used', usedAt: input.now })
					.where(and(
						eq(telegramLoginRequests.id, input.requestId),
						eq(telegramLoginRequests.purpose, 'link'),
						eq(telegramLoginRequests.linkUserId, input.linkUserId),
						eq(telegramLoginRequests.status, 'confirmed'),
						eq(telegramLoginRequests.secretHash, input.secretHash),
						gt(telegramLoginRequests.expiresAt, input.now)
					))
					.run();

				if (consumed.changes !== 1) {
					return { kind: 'not-consumed' };
				}

				const identity = this.readIdentity(transaction, input.requestId);
				const assessment = assessLink(transaction, input.linkUserId, identity.telegramId);

				switch (assessment.kind) {
					case 'account-has-telegram':
					case 'telegram-linked-elsewhere':
						// The request stays used: a confirmation is one decision, not a ticket to retry later.
						return { kind: assessment.kind };
					case 'already-linked': {
						const refreshed = transaction.update(telegramAccounts)
							.set(telegramIdentityColumns(identity, input.now))
							.where(and(eq(telegramAccounts.userId, input.linkUserId), eq(telegramAccounts.telegramId, identity.telegramId)))
							.run();

						requireOneRow(transaction, refreshed.changes);

						return { kind: 'linked', mergedUserId: null, username: identity.username };
					}
					case 'free':
						transaction.insert(telegramAccounts)
							.values({
								...telegramIdentityColumns(identity, input.now),
								lastSignInAt: input.now,
								linkedAt: input.now,
								telegramId: identity.telegramId,
								userId: input.linkUserId
							})
							.run();

						return { kind: 'linked', mergedUserId: null, username: identity.username };
					case 'merge':
						mergeDuplicate(transaction, {
							duplicateHouseholdId: assessment.duplicateHouseholdId,
							duplicateUserId: assessment.duplicateUserId,
							identity,
							linkUserId: input.linkUserId,
							now: input.now
						});

						return { kind: 'linked', mergedUserId: assessment.duplicateUserId, username: identity.username };
				}
			});
		}
		catch (error: unknown) {
			// A conditional statement of the merge changed nothing: everything, the request included, was rolled back.
			// Refuse like a duplicate with data; nothing was deleted.
			if (error instanceof TransactionRollbackError) {
				return { kind: 'telegram-linked-elsewhere' };
			}

			throw error;
		}
	}

	private readIdentity(transaction: TelegramLinkTransaction, requestId: string): TelegramIdentity {
		const row = transaction.select({
			chatId: telegramLoginRequests.chatId,
			firstName: telegramLoginRequests.firstName,
			lastName: telegramLoginRequests.lastName,
			telegramId: telegramLoginRequests.telegramId,
			username: telegramLoginRequests.username
		})
			.from(telegramLoginRequests)
			.where(eq(telegramLoginRequests.id, requestId))
			.get();

		if (row === undefined || row.telegramId === null || row.firstName === null || row.chatId === null) {
			// A confirmed request always carries the identity (`confirm` writes both at once): this is a broken row.
			throw new Error('A confirmed Telegram link request has no identity.');
		}

		return {
			chatId: row.chatId,
			firstName: row.firstName,
			lastName: row.lastName,
			telegramId: row.telegramId,
			username: row.username
		};
	}
}
