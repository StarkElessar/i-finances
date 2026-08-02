import { db } from '~/server/db/client';
import type {
	NewWebauthnChallengeRecord,
	NewWebauthnCredentialRecord,
	WebauthnChallengePurpose,
	WebauthnChallengeRecord,
	WebauthnCredentialRecord
} from '~/server/db/schema';
import { users, webauthnChallenges, webauthnCredentials } from '~/server/db/schema';

import { and, eq, gt, isNull } from 'drizzle-orm';

/**
 * Persisted credential joined with the owning user status.
 */
export type WebauthnCredentialWithUserRecord = {
	credential: WebauthnCredentialRecord;
	user: {
		id: string;
		username: string;
		displayName: string;
		isActive: boolean;
	};
};

/**
 * Stores a one-time WebAuthn challenge.
 */
export async function insertWebauthnChallenge(record: NewWebauthnChallengeRecord): Promise<void> {
	await db.insert(webauthnChallenges).values(record);
}

/**
 * Atomically consumes one active WebAuthn challenge.
 */
export async function consumeWebauthnChallenge(input: {
	challenge: string;
	purpose: WebauthnChallengePurpose;
	now: Date;
	userId?: string;
}): Promise<WebauthnChallengeRecord | undefined> {
	const conditions = [
		eq(webauthnChallenges.challenge, input.challenge),
		eq(webauthnChallenges.purpose, input.purpose),
		isNull(webauthnChallenges.consumedAt),
		gt(webauthnChallenges.expiresAt, input.now)
	];

	if (input.userId) {
		conditions.push(eq(webauthnChallenges.userId, input.userId));
	}

	const [record] = await db.update(webauthnChallenges)
		.set({ consumedAt: input.now })
		.where(and(...conditions))
		.returning();

	return record;
}

/**
 * Returns all credentials owned by one user.
 */
export async function findWebauthnCredentialsByUserId(userId: string): Promise<WebauthnCredentialRecord[]> {
	return db.select()
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.userId, userId));
}

/**
 * Finds one credential and its active-state owner by credential id.
 */
export async function findWebauthnCredentialWithUserById(id: string): Promise<WebauthnCredentialWithUserRecord | undefined> {
	const [record] = await db.select({
		credential: webauthnCredentials,
		user: {
			id: users.id,
			username: users.username,
			displayName: users.displayName,
			isActive: users.isActive
		}
	})
		.from(webauthnCredentials)
		.innerJoin(users, eq(webauthnCredentials.userId, users.id))
		.where(eq(webauthnCredentials.id, id))
		.limit(1);

	return record;
}

/**
 * Stores a newly verified WebAuthn credential.
 */
export async function insertWebauthnCredential(record: NewWebauthnCredentialRecord): Promise<void> {
	await db.insert(webauthnCredentials).values(record);
}

/**
 * Updates replay-protection metadata after successful authentication.
 */
export async function updateWebauthnCredentialUsage(input: {
	id: string;
	counter: number;
	deviceType: string;
	backedUp: boolean;
	lastUsedAt: Date;
}): Promise<void> {
	await db.update(webauthnCredentials)
		.set({
			counter: input.counter,
			deviceType: input.deviceType,
			backedUp: input.backedUp,
			lastUsedAt: input.lastUsedAt
		})
		.where(eq(webauthnCredentials.id, input.id));
}
