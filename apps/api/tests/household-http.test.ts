import { createApiApp } from '@/app';
import { HouseholdHttpController } from '@/http/household-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { householdMembers, households, telegramAccounts, users } from '@/infrastructure/database/schema';
import type { AuthConfig } from '@/modules/auth';
import {
	HouseholdAccessRequiredError,
	HouseholdRepository,
	HouseholdResolver,
	HouseholdService
} from '@/modules/household';

import { householdResultSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGIN = 'http://localhost:5173';
const FIXED_DATE = new Date('2026-10-18T10:00:00.000Z');
const AUTH_CONFIG: AuthConfig = {
	origin: ORIGIN,
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: 24 * 60 * 60 * 1000,
	trustedProxyCount: 0,
	webauthnRpId: 'localhost',
	webauthnRpName: 'iFinances'
};

const OWNER_ID = 'owner-user';
const MEMBER_ID = 'member-user';
const NEWCOMER_ID = 'newcomer-user';
const EXISTING_HOUSEHOLD_ID = 'default-household';

let connection: Database.Database;
let database: AppDatabase;

/** The test picks the caller with the `x-test-user` header; the real resolvers are covered elsewhere. */
const headerSessionResolver: RequestSessionResolver = {
	resolve: async (request) => {
		const userId = request.headers.get('x-test-user');

		return userId === null
			? null
			: {
				expiresAt: new Date(FIXED_DATE.getTime() + AUTH_CONFIG.sessionTtlMilliseconds),
				id: `session-${userId}`,
				user: { displayName: userId, id: userId, username: userId }
			};
	}
};

async function insertUser(id: string, displayName: string): Promise<void> {
	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName,
		id,
		isActive: true,
		passwordHash: null,
		updatedAt: FIXED_DATE,
		username: id
	});
}

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await insertUser(OWNER_ID, 'Сергей');
	await insertUser(MEMBER_ID, 'Анна');
	await insertUser(NEWCOMER_ID, 'Олег');
	// The state DB-3 leaves on production: the existing household with an owner and a member.
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: EXISTING_HOUSEHOLD_ID,
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await database.insert(householdMembers).values([
		{ householdId: EXISTING_HOUSEHOLD_ID, joinedAt: FIXED_DATE, role: 'owner', userId: OWNER_ID },
		{ householdId: EXISTING_HOUSEHOLD_ID, joinedAt: new Date(FIXED_DATE.getTime() + 1000), role: 'member', userId: MEMBER_ID }
	]);
	await database.insert(telegramAccounts).values({
		chatId: '1001',
		firstName: 'Анна',
		lastName: null,
		lastSignInAt: FIXED_DATE,
		linkedAt: FIXED_DATE,
		telegramId: '1001',
		updatedAt: FIXED_DATE,
		userId: MEMBER_ID,
		username: 'anna'
	});
});

afterEach(() => {
	connection.close();
});

function createHouseholdApp() {
	const householdRepository = new HouseholdRepository(database);
	const householdResolver = new HouseholdResolver(householdRepository);
	const householdService = new HouseholdService({
		createId: () => 'new-household',
		householdRepository,
		householdResolver,
		now: () => FIXED_DATE
	});

	return createApiApp({
		householdController: new HouseholdHttpController(householdService, headerSessionResolver, AUTH_CONFIG)
	});
}

function send(method: 'GET' | 'POST' | 'PUT', userId: string | undefined, body?: unknown, origin = ORIGIN) {
	const headers: Record<string, string> = { 'content-type': 'application/json', origin };

	if (userId !== undefined) {
		headers['x-test-user'] = userId;
	}

	return createHouseholdApp().request('/api/household', {
		body: body === undefined ? undefined : JSON.stringify(body),
		headers,
		method
	});
}

function countRows() {
	return {
		households: connection.prepare('SELECT count(*) AS count FROM households').get(),
		members: connection.prepare('SELECT household_id, user_id, role FROM household_members ORDER BY user_id').all()
	};
}

describe('HouseholdResolver', () => {
	it('never creates a household: a user without membership gets HouseholdAccessRequiredError and nothing is written', async () => {
		const before = countRows();
		const resolver = new HouseholdResolver(new HouseholdRepository(database));

		await expect(resolver.requireForUser(NEWCOMER_ID)).rejects.toBeInstanceOf(HouseholdAccessRequiredError);
		await expect(resolver.findForUser(NEWCOMER_ID)).resolves.toBeUndefined();
		expect(countRows()).toEqual(before);
	});

	it('resolves existing owner and member to their household with their role, as before', async () => {
		const resolver = new HouseholdResolver(new HouseholdRepository(database));

		await expect(resolver.requireForUser(OWNER_ID)).resolves.toEqual({
			baseCurrency: 'BYN',
			id: EXISTING_HOUSEHOLD_ID,
			name: 'Семья',
			role: 'owner'
		});
		await expect(resolver.requireForUser(MEMBER_ID)).resolves.toMatchObject({ id: EXISTING_HOUSEHOLD_ID, role: 'member' });
	});
});

describe('GET /api/household', () => {
	it('returns the household and its members to a member', async () => {
		const response = await send('GET', MEMBER_ID);

		expect(response.status).toBe(200);
		expect(householdResultSchema.parse(await response.json())).toEqual({
			household: {
				baseCurrency: 'BYN',
				id: EXISTING_HOUSEHOLD_ID,
				members: [
					{ displayName: 'Сергей', joinedAt: FIXED_DATE.toISOString(), role: 'owner', telegramUsername: null, userId: OWNER_ID },
					{
						displayName: 'Анна',
						joinedAt: new Date(FIXED_DATE.getTime() + 1000).toISOString(),
						role: 'member',
						telegramUsername: 'anna',
						userId: MEMBER_ID
					}
				],
				name: 'Семья',
				role: 'member'
			},
			ok: true
		});
	});

	it('answers 403 household-required without a household and 401 without a session', async () => {
		const onboarding = await send('GET', NEWCOMER_ID);
		const anonymous = await send('GET', undefined);

		expect(onboarding.status).toBe(403);
		expect(await onboarding.json()).toMatchObject({ errorCode: 'household-required', ok: false });
		expect(anonymous.status).toBe(401);
	});
});

describe('POST /api/household', () => {
	it('creates a BYN household with the caller as owner in onboarding', async () => {
		const response = await send('POST', NEWCOMER_ID, { name: '  Наш дом ' });

		expect(response.status).toBe(201);
		expect(householdResultSchema.parse(await response.json())).toEqual({
			household: {
				baseCurrency: 'BYN',
				id: 'new-household',
				members: [{
					displayName: 'Олег',
					joinedAt: FIXED_DATE.toISOString(),
					role: 'owner',
					telegramUsername: null,
					userId: NEWCOMER_ID
				}],
				name: 'Наш дом',
				role: 'owner'
			},
			ok: true
		});
		expect(connection.prepare('SELECT id, name, base_currency FROM households WHERE id = ?').get('new-household'))
			.toEqual({ base_currency: 'BYN', id: 'new-household', name: 'Наш дом' });
		expect((await send('GET', NEWCOMER_ID)).status).toBe(200);
	});

	it('answers 409 already-in-household with no side effects for existing owner, member and a second create', async () => {
		const before = countRows();

		for (const userId of [OWNER_ID, MEMBER_ID]) {
			const response = await send('POST', userId, { name: 'Ещё одно' });

			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ errorCode: 'already-in-household', ok: false });
		}

		expect(countRows()).toEqual(before);

		expect((await send('POST', NEWCOMER_ID, { name: 'Первое' })).status).toBe(201);
		const afterFirst = countRows();
		const second = await send('POST', NEWCOMER_ID, { name: 'Второе' });

		expect(second.status).toBe(409);
		expect(countRows()).toEqual(afterFirst);
	});

	it('creates nothing on a cross-origin request or an invalid name', async () => {
		const before = countRows();
		const crossOrigin = await send('POST', NEWCOMER_ID, { name: 'Наш дом' }, 'https://evil.example');
		const invalid = await send('POST', NEWCOMER_ID, { name: '   ' });

		expect(crossOrigin.status).toBe(403);
		expect(await crossOrigin.json()).toMatchObject({ errorCode: 'invalid-origin' });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ errorCode: 'invalid-input', fieldErrors: { name: expect.any(String) } });
		expect(countRows()).toEqual(before);
	});

	it('reports a lost race on the unique membership index as already-in-household, not as a server error', async () => {
		const repository = new HouseholdRepository(database);

		// Simulates another connection that added the membership between our check and our insert.
		connection.exec(`
			CREATE TRIGGER simulate_concurrent_join BEFORE INSERT ON households
			BEGIN
				INSERT INTO household_members (household_id, user_id, role, joined_at)
				VALUES ('${EXISTING_HOUSEHOLD_ID}', '${NEWCOMER_ID}', 'member', 0);
			END;
		`);

		expect(repository.createWithOwner({
			baseCurrency: 'BYN',
			createdAt: FIXED_DATE,
			householdId: 'racing-household',
			name: 'Гонка',
			ownerUserId: NEWCOMER_ID
		})).toBeUndefined();
		expect(connection.prepare('SELECT count(*) AS count FROM households WHERE id = ?').get('racing-household')).toEqual({ count: 0 });
	});
});

describe('PUT /api/household', () => {
	it('lets the owner rename the household', async () => {
		const response = await send('PUT', OWNER_ID, { name: 'Семья Ивановых' });

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ household: { name: 'Семья Ивановых', role: 'owner' }, ok: true });
		expect(await database.select({ name: households.name }).from(households).where(eq(households.id, EXISTING_HOUSEHOLD_ID)))
			.toEqual([{ name: 'Семья Ивановых' }]);
	});

	it('refuses a member with 403 owner-required and keeps the name', async () => {
		const response = await send('PUT', MEMBER_ID, { name: 'Захват' });

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ errorCode: 'owner-required', ok: false });
		expect(await database.select({ name: households.name }).from(households).where(eq(households.id, EXISTING_HOUSEHOLD_ID)))
			.toEqual([{ name: 'Семья' }]);
	});

	it('answers household-required to a user without a household', async () => {
		const response = await send('PUT', NEWCOMER_ID, { name: 'Чужое' });

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ errorCode: 'household-required' });
	});
});
