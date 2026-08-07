import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from '../src/app';
import { AccountHttpController } from '../src/http/account-controller';
import type { RequestSessionResolver } from '../src/http/session-resolver';
import type { AppDatabase } from '../src/infrastructure/database/client';
import * as schema from '../src/infrastructure/database/schema';
import { householdMembers, households, users } from '../src/infrastructure/database/schema';
import {
	AccountCurrencyCorrectionRepository,
	AccountCurrencyCorrector,
	AccountRepository,
	AccountService
} from '../src/modules/account';
import type { AuthenticatedSession } from '../src/modules/auth';
import { ExchangeRateRepository, ExchangeRateService } from '../src/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '../src/modules/household';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'default-household';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await database.insert(householdMembers).values({
		householdId: HOUSEHOLD_ID,
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
});

afterEach(() => {
	connection.close();
});

function createController(sessionResolver: RequestSessionResolver): AccountHttpController {
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));
	const accountService = new AccountService({
		accountCurrencyCorrector: new AccountCurrencyCorrector(
			new AccountCurrencyCorrectionRepository(database),
			exchangeRateService
		),
		accountRepository: new AccountRepository(database),
		createId: () => 'account-http',
		householdResolver,
		now: () => FIXED_DATE
	});

	return new AccountHttpController(accountService, sessionResolver);
}

const noSessionResolver: RequestSessionResolver = {
	resolve: async () => null
};

const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-08-24T10:00:00.000Z'),
	id: 'session-1',
	user: {
		displayName: 'Sergei Test',
		id: USER_ID,
		username: 'sergei'
	}
};

const sessionResolver: RequestSessionResolver = {
	resolve: async () => authenticatedSession
};

describe('Accounts HTTP controller', () => {
	it('keeps protected account reads behind a session boundary', async () => {
		const app = createApiApp({ accountController: createController(noSessionResolver) });
		const response = await app.request('/api/accounts');

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		});
	});

	it('rejects cross-origin mutations and accepts an authenticated command', async () => {
		const app = createApiApp({ accountController: createController(sessionResolver) });
		const input = {
			color: '#3f77a8',
			currency: 'BYN',
			description: '',
			initialBalanceMinor: 10_000,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Основной счёт',
			type: 'card'
		};
		const forbiddenResponse = await app.request('/api/accounts', {
			body: JSON.stringify(input),
			headers: {
				'content-type': 'application/json',
				origin: 'https://evil.example'
			},
			method: 'POST'
		});

		expect(forbiddenResponse.status).toBe(403);
		expect((await forbiddenResponse.json())).toMatchObject({
			errorCode: 'forbidden',
			ok: false
		});

		const response = await app.request('/api/accounts', {
			body: JSON.stringify(input),
			headers: {
				'content-type': 'application/json',
				origin: 'http://localhost:5173'
			},
			method: 'POST'
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			account: {
				id: 'account-http',
				name: 'Основной счёт',
				version: 1
			},
			ok: true
		});
	});
});
