import { createApiApp } from '@/app';
import { HouseholdHttpController } from '@/http/household-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { appInvitations, householdMembers, households, telegramAccounts, users } from '@/infrastructure/database/schema';
import { type AuthConfig, PlatformAdminPolicy, SessionRepository } from '@/modules/auth';
import {
	HouseholdAccessRequiredError,
	HouseholdMembershipRepository,
	HouseholdRepository,
	HouseholdResolver,
	HouseholdService
} from '@/modules/household';

import { householdErrorMessageByCode, householdResultSchema } from '@i-finances/contracts';
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
/** Signed up with an invitation into the application (`app_invitations.accepted_by_user_id`), no household yet. */
const APP_GUEST_ID = 'app-guest-user';
/** Was an owner once (`users.first_household_owner_at`), no household now. */
const FORMER_OWNER_ID = 'former-owner-user';
/** A platform administrator by login only: nothing in the database. */
const ADMIN_ID = 'admin-user';
const EXISTING_HOUSEHOLD_ID = 'default-household';
const FORMER_OWNER_SINCE = new Date('2026-01-05T08:00:00.000Z');

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
	await insertUser(APP_GUEST_ID, 'Мария');
	await insertUser(FORMER_OWNER_ID, 'Ирина');
	await insertUser(ADMIN_ID, 'Админ');
	await database.update(users).set({ firstHouseholdOwnerAt: FORMER_OWNER_SINCE }).where(eq(users.id, FORMER_OWNER_ID));
	await database.insert(appInvitations).values({
		acceptedAt: FIXED_DATE,
		acceptedByUserId: APP_GUEST_ID,
		createdAt: FIXED_DATE,
		createdByUserId: ADMIN_ID,
		expiresAt: new Date(FIXED_DATE.getTime() + 1000),
		id: 'app-invitation',
		tokenHash: 'a'.repeat(64)
	});
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
		membershipRepository: new HouseholdMembershipRepository(database, new SessionRepository(database)),
		now: () => FIXED_DATE,
		platformAdmins: new PlatformAdminPolicy(new Set([ADMIN_ID]))
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
		members: connection.prepare('SELECT household_id, user_id, role FROM household_members ORDER BY user_id').all(),
		owners: connection.prepare('SELECT id, first_household_owner_at FROM users ORDER BY id').all()
	};
}

function firstOwnerAt(userId: string): Date | null | undefined {
	return database.select({ at: users.firstHouseholdOwnerAt }).from(users).where(eq(users.id, userId)).get()?.at;
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
	it('creates a BYN household with the caller as owner in onboarding and writes down when they became an owner', async () => {
		expect(firstOwnerAt(APP_GUEST_ID)).toBeNull();

		const response = await send('POST', APP_GUEST_ID, { name: '  Наш дом ' });

		expect(response.status).toBe(201);
		expect(householdResultSchema.parse(await response.json())).toEqual({
			household: {
				baseCurrency: 'BYN',
				id: 'new-household',
				members: [{
					displayName: 'Мария',
					joinedAt: FIXED_DATE.toISOString(),
					role: 'owner',
					telegramUsername: null,
					userId: APP_GUEST_ID
				}],
				name: 'Наш дом',
				role: 'owner'
			},
			ok: true
		});
		expect(connection.prepare('SELECT id, name, base_currency FROM households WHERE id = ?').get('new-household'))
			.toEqual({ base_currency: 'BYN', id: 'new-household', name: 'Наш дом' });
		expect((await send('GET', APP_GUEST_ID)).status).toBe(200);
		expect(firstOwnerAt(APP_GUEST_ID)).toEqual(FIXED_DATE);
	});

	it('writes the time of the creator only: nobody else gets the right from somebody else\'s household', async () => {
		expect((await send('POST', APP_GUEST_ID, { name: 'Дом Марии' })).status).toBe(201);
		expect(firstOwnerAt(APP_GUEST_ID)).toEqual(FIXED_DATE);
		expect(firstOwnerAt(NEWCOMER_ID)).toBeNull();
		expect(firstOwnerAt(MEMBER_ID)).toBeNull();
		expect(firstOwnerAt(OWNER_ID)).toBeNull();
		expect(firstOwnerAt(FORMER_OWNER_ID)).toEqual(FORMER_OWNER_SINCE);

		const refused = await send('POST', NEWCOMER_ID, { name: 'Наш дом' });

		expect(refused.status).toBe(403);
		expect(await refused.json()).toMatchObject({ errorCode: 'household-creation-not-allowed' });
	});

	it('each ground alone is enough: an invitation into the application, a former owner, the administrator by login', async () => {
		for (const userId of [APP_GUEST_ID, FORMER_OWNER_ID, ADMIN_ID]) {
			connection.prepare('DELETE FROM households WHERE id = ?').run('new-household');

			const response = await send('POST', userId, { name: 'Своё' });

			expect(response.status, userId).toBe(201);
			expect(await response.json(), userId)
				.toMatchObject({ household: { members: [{ role: 'owner', userId }], role: 'owner' }, ok: true });
		}

		// The earlier time of a former owner is kept; the administrator's is written now.
		expect(firstOwnerAt(FORMER_OWNER_ID)).toEqual(FORMER_OWNER_SINCE);
		expect(firstOwnerAt(ADMIN_ID)).toEqual(FIXED_DATE);
	});

	it('refuses a user without any ground with 403 household-creation-not-allowed and writes nothing', async () => {
		const before = countRows();
		const response = await send('POST', NEWCOMER_ID, { name: 'Наш дом' });

		expect(response.status).toBe(403);
		expect(householdResultSchema.parse(await response.json())).toEqual({
			errorCode: 'household-creation-not-allowed',
			message: householdErrorMessageByCode['household-creation-not-allowed'],
			ok: false
		});
		expect(countRows()).toEqual(before);
	});

	it('a member is refused for the right first (not «leave first»), an owner gets 409, with no side effects', async () => {
		const before = countRows();
		const member = await send('POST', MEMBER_ID, { name: 'Ещё одно' });
		const owner = await send('POST', OWNER_ID, { name: 'Ещё одно' });

		expect(member.status).toBe(403);
		expect(await member.json()).toMatchObject({ errorCode: 'household-creation-not-allowed', ok: false });
		expect(owner.status).toBe(409);
		expect(await owner.json()).toMatchObject({ errorCode: 'already-in-household', ok: false });
		expect(countRows()).toEqual(before);

		expect((await send('POST', APP_GUEST_ID, { name: 'Первое' })).status).toBe(201);
		const afterFirst = countRows();
		const second = await send('POST', APP_GUEST_ID, { name: 'Второе' });

		expect(second.status).toBe(409);
		expect(await second.json()).toMatchObject({ errorCode: 'already-in-household' });
		expect(countRows()).toEqual(afterFirst);
	});

	it('two creations racing for one user: exactly one household', async () => {
		const answers = await Promise.all([
			send('POST', FORMER_OWNER_ID, { name: 'Первое' }),
			send('POST', FORMER_OWNER_ID, { name: 'Второе' })
		]);

		expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
		expect(connection.prepare('SELECT count(*) AS count FROM household_members WHERE user_id = ?').get(FORMER_OWNER_ID))
			.toEqual({ count: 1 });
	});

	it('creates nothing on a cross-origin request, an invalid name or without a session', async () => {
		const before = countRows();
		const crossOrigin = await send('POST', APP_GUEST_ID, { name: 'Наш дом' }, 'https://evil.example');
		const invalid = await send('POST', APP_GUEST_ID, { name: '   ' });
		const anonymous = await send('POST', undefined, { name: 'Наш дом' });

		expect(crossOrigin.status).toBe(403);
		expect(await crossOrigin.json()).toMatchObject({ errorCode: 'invalid-origin' });
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ errorCode: 'invalid-input', fieldErrors: { name: expect.any(String) } });
		expect(anonymous.status).toBe(401);
		expect(countRows()).toEqual(before);
	});

	it('reports a lost race on the unique membership index as already-in-household, not as a server error', async () => {
		const repository = new HouseholdRepository(database);

		// Simulates another connection that added the membership between our check and our insert.
		connection.exec(`
			CREATE TRIGGER simulate_concurrent_join BEFORE INSERT ON households
			BEGIN
				INSERT INTO household_members (household_id, user_id, role, joined_at)
				VALUES ('${EXISTING_HOUSEHOLD_ID}', '${APP_GUEST_ID}', 'member', 0);
			END;
		`);

		expect(repository.createWithOwner({
			baseCurrency: 'BYN',
			createdAt: FIXED_DATE,
			householdId: 'racing-household',
			name: 'Гонка',
			ownerIsPlatformAdmin: false,
			ownerUserId: APP_GUEST_ID
		})).toEqual({ kind: 'already-in-household' });
		expect(connection.prepare('SELECT count(*) AS count FROM households WHERE id = ?').get('racing-household')).toEqual({ count: 0 });
		expect(firstOwnerAt(APP_GUEST_ID)).toBeNull();
	});

	it('the repository refuses without a ground unless told the owner is an administrator', async () => {
		const repository = new HouseholdRepository(database);
		const input = { baseCurrency: 'BYN' as const, createdAt: FIXED_DATE, name: 'Прямо', ownerUserId: NEWCOMER_ID };

		expect(repository.createWithOwner({ ...input, householdId: 'refused', ownerIsPlatformAdmin: false }))
			.toEqual({ kind: 'not-allowed' });
		expect(connection.prepare('SELECT count(*) AS count FROM households WHERE id = ?').get('refused')).toEqual({ count: 0 });
		expect(firstOwnerAt(NEWCOMER_ID)).toBeNull();
		expect(repository.createWithOwner({ ...input, householdId: 'allowed', ownerIsPlatformAdmin: true }))
			.toMatchObject({ household: { id: 'allowed', role: 'owner' }, kind: 'created' });
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
