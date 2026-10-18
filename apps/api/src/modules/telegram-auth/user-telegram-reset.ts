import type { AppDatabase } from '@/infrastructure/database/client';
import { sessions, telegramAccounts, telegramLoginRequests, users, webauthnCredentials } from '@/infrastructure/database/schema';
import { hasUsablePassword, SessionRepository } from '@/modules/auth';

import { and, count, eq, inArray, or } from 'drizzle-orm';

import type { TelegramResetPlan, TelegramResetResult } from './telegram-reset-plan';
import { TelegramResetUserNotFoundError } from './telegram-reset-user-not-found-error';

export type ApplyTelegramResetInput = {
	/** Also delete every session row of the user. */
	endSessions: boolean;
	/** The Telegram account the operator saw in the plan: a link that has changed since is left alone. */
	expectedTelegramId: string;
	userId: string;
};

/**
 * Service recovery of access (Р10 in `development/decisions/telegram-auth-and-households-v1.md`): removes the Telegram
 * link of one user so that the person can link a different Telegram account, for instance after the Telegram account
 * was deleted or a stranger's account got linked.
 *
 * The user row, the password, the passkeys, the household membership and all data stay. Nothing here prints or returns
 * a secret (no password hash, no tokens, no chat id).
 */
export class UserTelegramReset {
	private readonly sessionRepository: SessionRepository;

	public constructor(private readonly database: AppDatabase) {
		this.sessionRepository = new SessionRepository(database);
	}

	/**
	 * Reads what a reset of this user would touch. Changes nothing.
	 *
	 * @throws TelegramResetUserNotFoundError when no user has this (normalized) username.
	 */
	public plan(username: string): TelegramResetPlan {
		const user = this.database.select({
			displayName: users.displayName,
			id: users.id,
			isActive: users.isActive,
			passwordHash: users.passwordHash,
			username: users.username
		})
			.from(users)
			.where(eq(users.username, username))
			.get();

		if (user === undefined) {
			throw new TelegramResetUserNotFoundError(username);
		}

		const account = this.database.select({
			firstName: telegramAccounts.firstName,
			linkedAt: telegramAccounts.linkedAt,
			telegramId: telegramAccounts.telegramId,
			username: telegramAccounts.username
		})
			.from(telegramAccounts)
			.where(eq(telegramAccounts.userId, user.id))
			.get();
		const passkeys = this.database.select({ value: count() })
			.from(webauthnCredentials)
			.where(eq(webauthnCredentials.userId, user.id))
			.get();
		const userSessions = this.database.select({ value: count() })
			.from(sessions)
			.where(eq(sessions.userId, user.id))
			.get();
		const openRequests = account === undefined
			? 0
			: this.database.select({ value: count() })
				.from(telegramLoginRequests)
				.where(openRequestsOf(user.id, account.telegramId))
				.get()?.value ?? 0;

		return {
			displayName: user.displayName,
			hasPassword: hasUsablePassword(user.passwordHash),
			isActive: user.isActive,
			openLoginRequestCount: openRequests,
			passkeyCount: passkeys?.value ?? 0,
			sessionCount: userSessions?.value ?? 0,
			telegram: account,
			userId: user.id,
			username: user.username
		};
	}

	/**
	 * Removes the Telegram link of the user, revokes the open login requests that could still hand out access through
	 * it and, when asked, ends the user's sessions. All in one transaction: either everything happens or nothing does.
	 *
	 * The link is deleted only if it is still the account from the plan (`user_id` and `telegram_id` both match). If it
	 * changed meanwhile, nothing is touched and `accountRemoved` is false.
	 */
	public apply(input: ApplyTelegramResetInput): TelegramResetResult {
		return this.database.transaction((transaction): TelegramResetResult => {
			const removal = transaction.delete(telegramAccounts)
				.where(and(
					eq(telegramAccounts.userId, input.userId),
					eq(telegramAccounts.telegramId, input.expectedTelegramId)
				))
				.run();

			if (removal.changes !== 1) {
				return { accountRemoved: false, requestsRevoked: 0, sessionsEnded: 0 };
			}

			// Rejected, not deleted: a browser still holding the secret gets «gone» instead of an unknown request.
			const revocation = transaction.update(telegramLoginRequests)
				.set({ status: 'rejected' })
				.where(openRequestsOf(input.userId, input.expectedTelegramId))
				.run();
			const sessionsEnded = input.endSessions ? this.sessionRepository.deleteByUserId(input.userId, transaction) : 0;

			return { accountRemoved: true, requestsRevoked: revocation.changes, sessionsEnded };
		});
	}
}

/**
 * Requests that can still hand out access: `pending` or `confirmed` (not yet `used` or `rejected`), either a link
 * request of this user or a request confirmed by the Telegram account that is being unlinked.
 */
function openRequestsOf(userId: string, telegramId: string) {
	return and(
		inArray(telegramLoginRequests.status, ['pending', 'confirmed']),
		or(eq(telegramLoginRequests.linkUserId, userId), eq(telegramLoginRequests.telegramId, telegramId))
	);
}
