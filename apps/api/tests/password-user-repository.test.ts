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
			expiresAt: new Date('2026-08-24T10:00:00.000Z'),
			id: `${id}-session-${sessionNumber}`,
			lastSeenAt: FIXED_DATE,
			tokenHash: `${id}-token-${sessionNumber}`,
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

describe('PasswordUserRepository.replacePasswordAndRevokeOtherSessions', () => {
	it('stores the hash and revokes only the user\'s other sessions', async () => {
		const revoked = repository.replacePasswordAndRevokeOtherSessions({
			expectedPasswordHash: 'hash-before',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			userId: 'alice'
		});
		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(revoked).toBe(1);
		expect(alice.passwordHash).toBe('hash-after');
		expect(alice.updatedAt).toEqual(LATER_DATE);
		expect(await sessionIds()).toEqual(['alice-session-1', 'bob-session-1', 'bob-session-2']);
	});

	it('does nothing when the stored hash is not the one that was verified', async () => {
		const revoked = repository.replacePasswordAndRevokeOtherSessions({
			expectedPasswordHash: 'stale-hash',
			keepSessionId: 'alice-session-1',
			newPasswordHash: 'hash-after',
			now: LATER_DATE,
			userId: 'alice'
		});
		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(revoked).toBeUndefined();
		expect(alice.passwordHash).toBe('hash-before');
		expect(alice.updatedAt).toEqual(FIXED_DATE);
		expect(await sessionIds()).toHaveLength(4);
	});
});
