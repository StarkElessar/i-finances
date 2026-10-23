import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { sessions, users } from '@/infrastructure/database/schema';
import { PasswordUserRepository } from '@/modules/auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');
const LATER_DATE = new Date('2026-07-25T10:00:00.000Z');
// Deliberately not LATER_DATE + 30 days: a rotation that renewed the expiry from `now` must not pass by coincidence.
const SESSION_EXPIRES_AT = new Date('2026-08-10T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let repository: PasswordUserRepository;

async function insertUser(id: string): Promise<void> {
	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: id,
		id,
		isActive: true,
		passwordHash: 'hash-before',
		updatedAt: FIXED_DATE,
		username: id
	});

	for (const sessionNumber of [1, 2]) {
		await database.insert(sessions).values({
			createdAt: FIXED_DATE,
			expiresAt: SESSION_EXPIRES_AT,
			id: `${id}-session-${sessionNumber}`,
			ipAddress: '203.0.113.7',
			lastSeenAt: FIXED_DATE,
			tokenHash: `${id}-token-${sessionNumber}`,
			userAgent: 'test-agent',
			userId: id
		});
	}
}

async function sessionIds(): Promise<string[]> {
	return (await database.select({ id: sessions.id }).from(sessions)).map((row) => row.id).sort();
}

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	repository = new PasswordUserRepository(database);
	await insertUser('alice');
	await insertUser('bob');
});

afterEach(() => {
	connection.close();
});

describe('PasswordUserRepository.replacePasswordAndRotateSessions', () => {
	it('stores the hash and revokes only the user\'s other sessions', async () => {
		const replacement = repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});
		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(replacement?.revokedSessionCount).toBe(1);
		expect(alice.passwordHash).toBe('hash-after');
		expect(alice.updatedAt).toEqual(LATER_DATE);
		expect(await sessionIds()).toEqual(['alice-session-1', 'bob-session-1', 'bob-session-2']);
	});

	it('replaces the token hash of the kept session and keeps its id, dates and metadata', async () => {
		const replacement = repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});
		const [kept] = await database.select().from(sessions).where(eq(sessions.id, 'alice-session-1'));

		expect(replacement?.rotatedSession).toEqual({ expiresAt: SESSION_EXPIRES_AT });
		expect(kept).toMatchObject({
			createdAt: FIXED_DATE,
			expiresAt: SESSION_EXPIRES_AT,
			id: 'alice-session-1',
			ipAddress: '203.0.113.7',
			lastSeenAt: FIXED_DATE,
			tokenHash: 'rotated-hash',
			userAgent: 'test-agent',
			userId: 'alice'
		});
	});

	it('does not touch the tokens of other users\' sessions', async () => {
		repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});
		const bobSessions = await database.select().from(sessions).where(eq(sessions.userId, 'bob'));

		expect(bobSessions.map((session) => session.tokenHash).sort()).toEqual(['bob-token-1', 'bob-token-2']);
	});

	it('refuses to rotate a session that belongs to another user', async () => {
		const replacement = repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'bob-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});
		const [bobSession] = await database.select().from(sessions).where(eq(sessions.id, 'bob-session-1'));

		expect(replacement).toEqual({ revokedSessionCount: 2, rotatedSession: undefined });
		expect(bobSession.tokenHash).toBe('bob-token-1');
	});

	it('still changes the password when the kept session vanished meanwhile, and reports no rotation', async () => {
		const replacement = repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-gone',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});

		expect(replacement).toEqual({ revokedSessionCount: 2, rotatedSession: undefined });
		expect((await sessionIds()).filter((id) => id.startsWith('alice'))).toEqual([]);
	});

	it('is one transaction: when the last step fails, the old password and every session stay', async () => {
		const before = JSON.stringify({
			sessions: await database.select().from(sessions).orderBy(sessions.id),
			users: await database.select().from(users).orderBy(users.id)
		});

		// The rotated token collides with a token of Bob's session: the final UPDATE breaks the unique `token_hash`.
		expect(() => repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'bob-token-1',
			userId: 'alice'
		})).toThrow(/UNIQUE/u);

		expect(JSON.stringify({
			sessions: await database.select().from(sessions).orderBy(sessions.id),
			users: await database.select().from(users).orderBy(users.id)
		})).toBe(before);
	});

	it('does nothing when the stored hash is not the one that was verified', async () => {
		const replacement = repository.replacePasswordAndRotateSessions({
			expectedPasswordHash: 'stale-hash',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			rotatedTokenHash: 'rotated-hash',
			userId: 'alice'
		});
		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));
		const [kept] = await database.select().from(sessions).where(eq(sessions.id, 'alice-session-1'));

		expect(replacement).toBeUndefined();
		expect(alice.passwordHash).toBe('hash-before');
		expect(alice.updatedAt).toEqual(FIXED_DATE);
		expect(kept.tokenHash).toBe('alice-token-1');
		expect(await sessionIds()).toHaveLength(4);
	});
});
