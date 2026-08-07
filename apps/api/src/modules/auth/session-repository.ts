import { eq } from 'drizzle-orm';

import type { AppDatabase } from '../../infrastructure/database/client';
import { sessions, users } from '../../infrastructure/database/schema';

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

export class SessionRepository {
	public constructor(private readonly database: AppDatabase) {}

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
}
