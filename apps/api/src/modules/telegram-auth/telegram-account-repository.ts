import type { AppDatabase } from '@/infrastructure/database/client';
import { telegramAccounts, users } from '@/infrastructure/database/schema';
import { findActiveInvitationKind, reserveRegistrationInvitation } from '@/modules/app-invitation';
import { TELEGRAM_USERNAME_PREFIX } from '@/modules/auth';

import { eq, TransactionRollbackError } from 'drizzle-orm';

import { buildTelegramDisplayName } from './build-telegram-display-name';
import type { TelegramIdentity } from './telegram-identity';

export type TelegramAccount = {
	chatId: string;
	telegramId: string;
	userId: string;
	username: string | null;
};

export type TelegramSignInInput = {
	/**
	 * `TELEGRAM_REGISTRATION_ENABLED`: an unknown Telegram account creates a user when this is true, or when the
	 * request carries an invitation that is still active (`invitationTokenHash`).
	 */
	allowRegistration: boolean;
	identity: TelegramIdentity;
	/**
	 * SHA-256 of the invitation token bound to the login request at `start` (`app-invitations-v1.md`), or `null`. Only
	 * a sign-up looks at it; a known Telegram account signs in as usual and the invitation is left alone.
	 */
	invitationTokenHash: string | null;
	/** Id for the user created by a sign-up; unused otherwise. */
	newUserId: string;
	now: Date;
};

export type TelegramSignInResolution =
	| { isActive: boolean; kind: 'existing'; userId: string }
	| { kind: 'not-found' }
	| { kind: 'registered'; userId: string };

/**
 * Linked Telegram accounts (`telegram_accounts`, one-to-one with `users`). The primary key on `user_id` and the unique
 * `telegram_id` keep «one person, one Telegram» in the schema.
 */
export class TelegramAccountRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findByTelegramId(telegramId: string): Promise<TelegramAccount | undefined> {
		return this.database.select({
			chatId: telegramAccounts.chatId,
			telegramId: telegramAccounts.telegramId,
			userId: telegramAccounts.userId,
			username: telegramAccounts.username
		})
			.from(telegramAccounts)
			.where(eq(telegramAccounts.telegramId, telegramId))
			.get();
	}

	/** The linked Telegram of a user, if any: where the bot writes to them. */
	public async findByUserId(userId: string): Promise<TelegramAccount | undefined> {
		return this.database.select({
			chatId: telegramAccounts.chatId,
			telegramId: telegramAccounts.telegramId,
			userId: telegramAccounts.userId,
			username: telegramAccounts.username
		})
			.from(telegramAccounts)
			.where(eq(telegramAccounts.userId, userId))
			.get();
	}

	/** Set when the bot's message to this user answers 403: the user blocked the bot (`bot_blocked_at`). */
	public async markBotBlocked(userId: string, now: Date): Promise<void> {
		this.database.update(telegramAccounts)
			.set({ botBlockedAt: now, updatedAt: now })
			.where(eq(telegramAccounts.userId, userId))
			.run();
	}

	/**
	 * Finds the user of this Telegram account and refreshes what Telegram reported (name, username, chat; a person who
	 * just pressed a button has not blocked the bot). An unknown account becomes a new user without a password and
	 * without a household (`username = tg-<telegram id>`, Р3, Р4) when `allowRegistration` is set.
	 *
	 * One synchronous transaction: two sign-ins of the same new Telegram account cannot both create a user, and the
	 * unique `telegram_id` would refuse the second one anyway.
	 *
	 * With registration closed, a sign-up needs an invitation bound to the request (`app-invitations-v1.md`). Whether it
	 * is still active is decided here, inside the transaction that creates the user, and the same transaction spends
	 * it (`reserveRegistrationInvitation`: an invitation into the application is consumed, a household invitation only
	 * loses its one sign-up). If that conditional update changes nothing, everything is rolled back, the user included,
	 * and the answer is `not-found` as for no invitation at all: of two sign-ups with one link exactly one succeeds.
	 */
	public async signIn(input: TelegramSignInInput): Promise<TelegramSignInResolution> {
		try {
			return this.signInInTransaction(input);
		}
		catch (error: unknown) {
			if (error instanceof TransactionRollbackError) {
				return { kind: 'not-found' };
			}

			throw error;
		}
	}

	private signInInTransaction(input: TelegramSignInInput): TelegramSignInResolution {
		const { identity, invitationTokenHash, now } = input;

		return this.database.transaction((transaction): TelegramSignInResolution => {
			const existing = transaction.select({ isActive: users.isActive, userId: telegramAccounts.userId })
				.from(telegramAccounts)
				.innerJoin(users, eq(users.id, telegramAccounts.userId))
				.where(eq(telegramAccounts.telegramId, identity.telegramId))
				.get();

			if (existing !== undefined) {
				if (existing.isActive) {
					transaction.update(telegramAccounts)
						.set({
							botBlockedAt: null,
							chatId: identity.chatId,
							firstName: identity.firstName,
							lastName: identity.lastName,
							lastSignInAt: now,
							updatedAt: now,
							username: identity.username
						})
						.where(eq(telegramAccounts.userId, existing.userId))
						.run();
				}

				return { isActive: existing.isActive, kind: 'existing', userId: existing.userId };
			}

			const invitationKind = invitationTokenHash === null
				? undefined
				: findActiveInvitationKind(transaction, invitationTokenHash, now);

			if (!input.allowRegistration && invitationKind === undefined) {
				return { kind: 'not-found' };
			}

			transaction.insert(users).values({
				createdAt: now,
				displayName: buildTelegramDisplayName(identity),
				id: input.newUserId,
				isActive: true,
				passwordHash: null,
				updatedAt: now,
				username: `${TELEGRAM_USERNAME_PREFIX}${identity.telegramId}`
			}).run();
			transaction.insert(telegramAccounts).values({
				chatId: identity.chatId,
				firstName: identity.firstName,
				lastName: identity.lastName,
				lastSignInAt: now,
				linkedAt: now,
				telegramId: identity.telegramId,
				updatedAt: now,
				userId: input.newUserId,
				username: identity.username
			}).run();

			// After the user exists (the invitation points at it). With the flag on the invitation is spent if it can be,
			// and the sign-up does not depend on it.
			if (invitationKind !== undefined && invitationTokenHash !== null) {
				const reserved = reserveRegistrationInvitation(transaction, {
					kind: invitationKind,
					now,
					tokenHash: invitationTokenHash,
					userId: input.newUserId
				});

				if (!reserved && !input.allowRegistration) {
					transaction.rollback();
				}
			}

			return { kind: 'registered', userId: input.newUserId };
		});
	}
}
