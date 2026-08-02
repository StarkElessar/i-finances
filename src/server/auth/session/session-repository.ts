import { db } from '~/server/db/client';
import type { NewSessionRecord } from '~/server/db/schema';
import { sessions, users } from '~/server/db/schema';

import { eq, lt } from 'drizzle-orm';

/**
 * Session row joined with the safe user fields needed by request guards.
 */
export type SessionWithUserRecord = {
	session: typeof sessions.$inferSelect;
	user: {
		id: string;
		username: string;
		displayName: string;
		isActive: boolean;
	};
};

/**
 * Persists a newly created opaque session.
 */
export async function insertSession(record: NewSessionRecord): Promise<void> {
	await db.insert(sessions).values(record);
}

/**
 * Finds a session and its user by the stored token hash.
 */
export async function findSessionByTokenHash(tokenHash: string): Promise<SessionWithUserRecord | undefined> {
	const [record] = await db.select({
		session: sessions,
		user: {
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			isActive: users.isActive
		}
	})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.tokenHash, tokenHash))
		.limit(1);

	return record;
}

/**
 * Updates the activity timestamp without extending absolute expiration.
 */
export async function touchSession(sessionId: string, lastSeenAt: Date): Promise<void> {
	await db.update(sessions)
		.set({ lastSeenAt })
		.where(eq(sessions.id, sessionId));
}

/**
 * Revokes a session immediately.
 */
export async function deleteSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Removes all sessions whose absolute expiration has passed.
 */
export async function deleteExpiredSessions(now: Date): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
