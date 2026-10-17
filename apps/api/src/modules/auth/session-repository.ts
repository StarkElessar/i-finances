import type { AppDatabase } from '@/infrastructure/database/client';
import { sessions, users } from '@/infrastructure/database/schema';

import { and, desc, eq, gt, lt, ne } from 'drizzle-orm';

export type SessionWithUserRecord = {
	session: {
		expiresAt: Date;
		id: string;
		lastSeenAt: Date;
	};
	user: {
		displayName: string;
		id: string;
		isActive: boolean;
		username: string;
	};
};

export type SessionInsertRecord = {
	createdAt: Date;
	expiresAt: Date;
	id: string;
	ipAddress?: string;
	lastSeenAt: Date;
	tokenHash: string;
	userAgent?: string;
	userId: string;
};

export type SessionSummaryRecord = {
	createdAt: Date;
	expiresAt: Date;
	id: string;
	ipAddress: string | null;
	lastSeenAt: Date;
	userAgent: string | null;
};

export class SessionRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async insert(record: SessionInsertRecord): Promise<void> {
		await this.database.insert(sessions).values(record);
	}

	public async findByTokenHash(
		tokenHash: string
	): Promise<SessionWithUserRecord | undefined> {
		const [record] = await this.database.select({
			session: {
				expiresAt: sessions.expiresAt,
				id: sessions.id,
				lastSeenAt: sessions.lastSeenAt
			},
			user: {
				displayName: users.displayName,
				id: users.id,
				isActive: users.isActive,
				username: users.username
			}
		})
			.from(sessions)
			.innerJoin(users, eq(sessions.userId, users.id))
			.where(eq(sessions.tokenHash, tokenHash))
			.limit(1);

		return record;
	}

	public async touch(sessionId: string, lastSeenAt: Date): Promise<void> {
		await this.database.update(sessions)
			.set({ lastSeenAt })
			.where(eq(sessions.id, sessionId));
	}

	public async delete(sessionId: string): Promise<void> {
		await this.database.delete(sessions)
			.where(eq(sessions.id, sessionId));
	}

	public async deleteExpired(now: Date): Promise<void> {
		await this.database.delete(sessions)
			.where(lt(sessions.expiresAt, now));
	}

	/**
	 * Lists the user's own unexpired sessions, most recently active first.
	 * The token hash is deliberately not part of the result.
	 */
	public async findActiveByUserId(userId: string, now: Date): Promise<SessionSummaryRecord[]> {
		return this.database.select({
			createdAt: sessions.createdAt,
			expiresAt: sessions.expiresAt,
			id: sessions.id,
			ipAddress: sessions.ipAddress,
			lastSeenAt: sessions.lastSeenAt,
			userAgent: sessions.userAgent
		})
			.from(sessions)
			.where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
			.orderBy(desc(sessions.lastSeenAt), desc(sessions.createdAt));
	}

	/**
	 * Deletes one session only when it belongs to the given user.
	 * Returns `false` for an unknown id and for another user's session alike.
	 */
	public async deleteForUser(userId: string, sessionId: string): Promise<boolean> {
		const deleted = await this.database.delete(sessions)
			.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
			.returning({ id: sessions.id });

		return deleted.length > 0;
	}

	/**
	 * Deletes every session of the user except the one that is kept.
	 * Returns how many sessions were removed.
	 */
	public async deleteOthersForUser(userId: string, keepSessionId: string): Promise<number> {
		const deleted = await this.database.delete(sessions)
			.where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)))
			.returning({ id: sessions.id });

		return deleted.length;
	}
}
