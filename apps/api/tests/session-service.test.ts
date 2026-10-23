import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { sessions, users } from '@/infrastructure/database/schema';
import { type AuthConfig, SessionRepository, SessionService } from '@/modules/auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `validateSessionToken` is what every cookie request goes through: a real token is accepted only before `expires_at`
 * and only while its user is active. The expiry is absolute (`session-rotation.md`), so it is checked on every request,
 * not only by the periodic cleanup.
 */

const SIGNED_IN_AT = new Date('2026-10-23T10:00:00.000Z');
const TTL_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const EXPIRES_AT = new Date(SIGNED_IN_AT.getTime() + TTL_MILLISECONDS);
const CONFIG: AuthConfig = {
	origin: 'http://localhost:5173',
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: TTL_MILLISECONDS,
	trustedProxyCount: 0,
	webauthnRpId: 'localhost',
	webauthnRpName: 'iFinances'
};

let connection: Database.Database;
let database: AppDatabase;
let clock: Date;
let service: SessionService;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	clock = SIGNED_IN_AT;
	service = new SessionService(new SessionRepository(database), { config: CONFIG, now: () => clock });
	await database.insert(users).values({
		createdAt: SIGNED_IN_AT,
		displayName: 'Анна',
		id: 'anna',
		isActive: true,
		passwordHash: null,
		updatedAt: SIGNED_IN_AT,
		username: 'anna'
	});
});

afterEach(() => {
	connection.close();
});

function sessionCount(): number {
	return database.select().from(sessions).all().length;
}

describe('SessionService.validateSessionToken', () => {
	it('accepts the issued token until the last millisecond before its expiry', async () => {
		const { expiresAt, token } = await service.createSession('anna');

		expect(expiresAt).toEqual(EXPIRES_AT);

		clock = new Date(EXPIRES_AT.getTime() - 1);

		expect(await service.validateSessionToken(token)).toMatchObject({ expiresAt: EXPIRES_AT, user: { id: 'anna' } });
	});

	it('refuses the token exactly at its expiry and removes the session', async () => {
		const { token } = await service.createSession('anna');

		clock = EXPIRES_AT;

		expect(await service.validateSessionToken(token)).toBeNull();
		expect(sessionCount()).toBe(0);
	});

	it('refuses the token after its expiry, also when the cleanup has not run', async () => {
		const { token } = await service.createSession('anna');

		clock = new Date(EXPIRES_AT.getTime() + 60_000);

		expect(await service.validateSessionToken(token)).toBeNull();
		expect(sessionCount()).toBe(0);
	});

	it('refuses the token of a user deactivated after it was issued, and removes the session', async () => {
		const { token } = await service.createSession('anna');

		expect(await service.validateSessionToken(token)).not.toBeNull();

		database.update(users).set({ isActive: false }).where(eq(users.id, 'anna')).run();

		expect(await service.validateSessionToken(token)).toBeNull();
		expect(sessionCount()).toBe(0);
	});

	it('refuses a missing, empty or unknown token', async () => {
		await service.createSession('anna');

		expect(await service.validateSessionToken(undefined)).toBeNull();
		expect(await service.validateSessionToken('')).toBeNull();
		expect(await service.validateSessionToken('not-a-token-anybody-was-given')).toBeNull();
		expect(sessionCount()).toBe(1);
	});
});
