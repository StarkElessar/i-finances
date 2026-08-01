import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { getAuthConfig } from '~/server/auth/auth-config';
import {
	deleteExpiredSessions,
	deleteSession,
	findSessionByTokenHash,
	insertSession,
	touchSession
} from '~/server/auth/session/session-repository';

const SESSION_TOUCH_INTERVAL_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * Request metadata retained for basic session auditing.
 */
export type SessionMetadata = {
	ipAddress?: string;
	userAgent?: string;
};

/**
 * Safe authenticated user data available to server handlers.
 */
export type SessionUser = {
	id: string;
	username: string;
	displayName: string;
};

/**
 * Validated server session returned to protected handlers.
 */
export type AuthenticatedSession = {
	id: string;
	expiresAt: Date;
	user: SessionUser;
};

/**
 * Newly created session token and its absolute expiration.
 */
export type CreatedSession = {
	token: string;
	expiresAt: Date;
};

/**
 * Hashes an opaque token before persistence or lookup.
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a revocable opaque session for one active user.
 */
export async function createSession(userId: string, metadata: SessionMetadata = {}): Promise<CreatedSession> {
	const token = randomBytes(32).toString('base64url');
	const now = new Date();
	const expiresAt = new Date(now.getTime() + getAuthConfig().sessionTtlMilliseconds);

	await insertSession({
		id: randomUUID(),
		tokenHash: hashSessionToken(token),
		userId,
		expiresAt,
		createdAt: now,
		lastSeenAt: now,
		ipAddress: metadata.ipAddress,
		userAgent: metadata.userAgent
	});

	return { token, expiresAt };
}

/**
 * Validates an opaque token, expiration and owning user status.
 */
export async function validateSessionToken(token: string | undefined): Promise<AuthenticatedSession | null> {
	if (!token) {
		return null;
	}

	const record = await findSessionByTokenHash(hashSessionToken(token));

	if (!record) {
		return null;
	}

	const now = new Date();

	if (record.session.expiresAt <= now || !record.user.isActive) {
		await deleteSession(record.session.id);
		return null;
	}

	if (now.getTime() - record.session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MILLISECONDS) {
		await touchSession(record.session.id, now);
	}

	return {
		id: record.session.id,
		expiresAt: record.session.expiresAt,
		user: {
			id: record.user.id,
			username: record.user.username,
			displayName: record.user.displayName
		}
	};
}

/**
 * Revokes the session represented by an opaque token.
 */
export async function revokeSessionToken(token: string | undefined): Promise<void> {
	if (token) {
		const record = await findSessionByTokenHash(hashSessionToken(token));

		if (record) {
			await deleteSession(record.session.id);
		}
	}
}

export { deleteExpiredSessions };
