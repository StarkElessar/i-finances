import type { AppDatabase } from '@/infrastructure/database/client';
import {
	type TelegramLoginRequestPurpose,
	type TelegramLoginRequestRecord,
	telegramLoginRequests,
	type TelegramLoginRequestStatus
} from '@/infrastructure/database/schema';

import { and, eq, gt, inArray, lt } from 'drizzle-orm';

import type { TelegramIdentity } from './telegram-identity';

export type TelegramLoginRequest = {
	code: string;
	confirmedAt: Date | null;
	createdAt: Date;
	expiresAt: Date;
	id: string;
	/** Who confirmed it in the bot; `null` until then. */
	identity: TelegramIdentity | null;
	ipAddress: string | null;
	linkUserId: string | null;
	purpose: TelegramLoginRequestPurpose;
	secretHash: string;
	status: TelegramLoginRequestStatus;
	usedAt: Date | null;
	userAgent: string | null;
};

export type NewTelegramLoginRequest = {
	code: string;
	createdAt: Date;
	expiresAt: Date;
	id: string;
	ipAddress?: string;
	/** Only for `link` (A4): the signed-in user Telegram is linked to. */
	linkUserId?: string;
	purpose: TelegramLoginRequestPurpose;
	secretHash: string;
	userAgent?: string;
};

function mapRequest(record: TelegramLoginRequestRecord): TelegramLoginRequest {
	const identity = record.telegramId === null || record.firstName === null || record.chatId === null
		? null
		: {
			chatId: record.chatId,
			firstName: record.firstName,
			lastName: record.lastName,
			telegramId: record.telegramId,
			username: record.username
		};

	return {
		code: record.code,
		confirmedAt: record.confirmedAt,
		createdAt: record.createdAt,
		expiresAt: record.expiresAt,
		id: record.id,
		identity,
		ipAddress: record.ipAddress,
		linkUserId: record.linkUserId,
		purpose: record.purpose,
		secretHash: record.secretHash,
		status: record.status,
		usedAt: record.usedAt,
		userAgent: record.userAgent
	};
}

/**
 * Deep-link login requests (`telegram_login_requests`).
 *
 * Every status change is one conditional `UPDATE ... WHERE status = <expected> [AND expires_at > now]` and reports
 * success only when exactly one row changed (Р11). Two concurrent confirmations, two concurrent completions, a
 * redelivered update after a restart: only the first one finds the expected status, every later one changes nothing
 * and gets `false`. The callers never decide a transition from a row they read earlier.
 */
export class TelegramLoginRequestRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async insert(record: NewTelegramLoginRequest): Promise<void> {
		this.database.insert(telegramLoginRequests).values({ ...record, status: 'pending' }).run();
	}

	public async findByCode(code: string): Promise<TelegramLoginRequest | undefined> {
		const record = this.database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, code)).get();

		return record === undefined ? undefined : mapRequest(record);
	}

	public async findById(id: string): Promise<TelegramLoginRequest | undefined> {
		const record = this.database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.id, id)).get();

		return record === undefined ? undefined : mapRequest(record);
	}

	/** Removes requests created before `before` (the caller passes «a day ago»). Returns how many went. */
	public async deleteCreatedBefore(before: Date): Promise<number> {
		return this.database.delete(telegramLoginRequests).where(lt(telegramLoginRequests.createdAt, before)).run().changes;
	}

	/** `pending → confirmed` with the identity from the bot, while the request is alive. */
	public async confirm(input: { id: string; identity: TelegramIdentity; now: Date }): Promise<boolean> {
		const result = this.database.update(telegramLoginRequests)
			.set({
				chatId: input.identity.chatId,
				confirmedAt: input.now,
				firstName: input.identity.firstName,
				lastName: input.identity.lastName,
				status: 'confirmed',
				telegramId: input.identity.telegramId,
				username: input.identity.username
			})
			.where(and(
				eq(telegramLoginRequests.id, input.id),
				eq(telegramLoginRequests.status, 'pending'),
				gt(telegramLoginRequests.expiresAt, input.now)
			))
			.run();

		return result.changes === 1;
	}

	/** `pending → rejected` («Это не я»), while the request is alive. */
	public async reject(input: { id: string; now: Date }): Promise<boolean> {
		const result = this.database.update(telegramLoginRequests)
			.set({ status: 'rejected' })
			.where(and(
				eq(telegramLoginRequests.id, input.id),
				eq(telegramLoginRequests.status, 'pending'),
				gt(telegramLoginRequests.expiresAt, input.now)
			))
			.run();

		return result.changes === 1;
	}

	/**
	 * `confirmed → used`: the one browser that holds the secret takes the confirmation, once. The secret hash is part of
	 * the condition, so a request is never consumed for a browser that did not start it, whatever the caller checked.
	 */
	public async consume(input: { id: string; now: Date; secretHash: string }): Promise<boolean> {
		const result = this.database.update(telegramLoginRequests)
			.set({ status: 'used', usedAt: input.now })
			.where(and(
				eq(telegramLoginRequests.id, input.id),
				eq(telegramLoginRequests.status, 'confirmed'),
				eq(telegramLoginRequests.secretHash, input.secretHash),
				gt(telegramLoginRequests.expiresAt, input.now)
			))
			.run();

		return result.changes === 1;
	}

	/** The starting browser abandons its request: `pending | confirmed → rejected`, so nobody can take it later. */
	public async cancel(input: { id: string; secretHash: string }): Promise<boolean> {
		const result = this.database.update(telegramLoginRequests)
			.set({ status: 'rejected' })
			.where(and(
				eq(telegramLoginRequests.id, input.id),
				eq(telegramLoginRequests.secretHash, input.secretHash),
				inArray(telegramLoginRequests.status, ['pending', 'confirmed'])
			))
			.run();

		return result.changes === 1;
	}
}
