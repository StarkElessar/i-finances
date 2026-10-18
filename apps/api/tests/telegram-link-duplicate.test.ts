import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	householdInvitations,
	householdMembers,
	households,
	operations,
	sessions,
	telegramAccounts,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';
import { assessDuplicate, mergeDuplicate, type TelegramIdentity } from '@/modules/telegram-auth';

import Database from 'better-sqlite3';
import { eq, TransactionRollbackError } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The two lines of defence of the duplicate merge (Р9), each on its own: `assessDuplicate` decides, and
 * `mergeDuplicate` refuses by its own conditions even when it is called for a duplicate with data (as if the
 * assessment had a bug). The HTTP flow is in `telegram-link-http.test.ts`.
 */

const AT = new Date('2026-10-01T10:00:00.000Z');
const NOW = new Date('2026-10-18T10:00:00.000Z');
const ANNA: TelegramIdentity = { chatId: '1001', firstName: 'Анна', lastName: null, telegramId: '1001', username: 'anna_k' };

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	await database.insert(users).values([
		{ createdAt: AT, displayName: 'Сергей', id: 'sergei', isActive: true, passwordHash: 'hash', updatedAt: AT, username: 'sergei' },
		{ createdAt: AT, displayName: 'Анна', id: 'duplicate', isActive: true, passwordHash: null, updatedAt: AT, username: 'tg-1001' }
	]);
	await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'family', name: 'Семья', updatedAt: AT });
	await database.insert(householdMembers).values({ householdId: 'family', joinedAt: AT, role: 'owner', userId: 'sergei' });
	await database.insert(telegramAccounts).values({
		chatId: '1001', firstName: 'Анна', lastName: null, lastSignInAt: AT, linkedAt: AT, telegramId: '1001', updatedAt: AT,
		userId: 'duplicate', username: null
	});
	await database.insert(sessions).values({
		createdAt: AT, expiresAt: NOW, id: 'dup-session', lastSeenAt: AT, tokenHash: 'a'.repeat(64), userId: 'duplicate'
	});
});

afterEach(() => {
	connection.close();
});

async function ownHousehold(): Promise<void> {
	await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'dup-home', name: 'Моё', updatedAt: AT });
	await database.insert(householdMembers).values({ householdId: 'dup-home', joinedAt: AT, role: 'owner', userId: 'duplicate' });
}

async function account(id: string, householdId: string, createdByUserId: string): Promise<void> {
	await database.insert(accounts).values({
		color: '#000000', createdAt: AT, createdByUserId, currency: 'BYN', householdId, id, initialBalanceMinor: 0, name: 'Карта',
		type: 'cash', updatedAt: AT
	});
}

function snapshot(): string {
	const tables = connection.prepare(
		'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\' AND name NOT LIKE \'__drizzle%\''
	).all() as Array<{ name: string }>;

	return JSON.stringify(tables.map(({ name }) => [name, connection.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
}

/** Each case: how the duplicate got data, and the household a buggy assessment would hand to the merge. */
const withData: Array<[string, () => Promise<void>, string | null]> = [
	['a password hash', async () => {
		await database.update(users).set({ passwordHash: '!placeholder' }).where(eq(users.id, 'duplicate'));
	}, null],
	['a passkey', async () => {
		await database.insert(webauthnCredentials).values({
			backedUp: false, counter: 0, createdAt: AT, deviceType: 'singleDevice', id: 'key', publicKey: 'cHVi', userId: 'duplicate'
		});
	}, null],
	['a deactivated account', async () => {
		await database.update(users).set({ isActive: false }).where(eq(users.id, 'duplicate'));
	}, null],
	['an account in its own household', async () => {
		await ownHousehold();
		await account('dup-card', 'dup-home', 'duplicate');
	}, 'dup-home'],
	['an account by somebody else in its own household', async () => {
		await ownHousehold();
		await account('dup-card', 'dup-home', 'sergei');
	}, 'dup-home'],
	['another member in its household', async () => {
		await ownHousehold();
		await database.insert(users).values({
			createdAt: AT, displayName: 'Гость', id: 'guest', isActive: true, passwordHash: null, updatedAt: AT, username: 'guest'
		});
		await database.insert(householdMembers).values({ householdId: 'dup-home', joinedAt: AT, role: 'member', userId: 'guest' });
	}, 'dup-home'],
	['membership in the family household (merge told «no household»)', async () => {
		await database.insert(householdMembers).values({ householdId: 'family', joinedAt: AT, role: 'member', userId: 'duplicate' });
	}, null],
	['membership in the family household (merge told to delete it)', async () => {
		await database.insert(householdMembers).values({ householdId: 'family', joinedAt: AT, role: 'member', userId: 'duplicate' });
	}, 'family'],
	['an account it created in another household', async () => {
		await account('dup-wrote', 'family', 'duplicate');
	}, null],
	['an operation it last edited in another household', async () => {
		await account('family-card', 'family', 'sergei');
		await database.insert(operations).values({
			accountId: 'family-card', amountInHouseholdBaseCurrencyMinor: 100, amountMinor: 100, createdAt: AT, createdByUserId: 'sergei',
			currency: 'BYN', exchangeRate: '1', exchangeRateEffectiveOn: '2026-10-01', exchangeRateSource: 'identity',
			happenedOn: '2026-10-01', householdBaseCurrency: 'BYN', householdId: 'family', id: 'op', sourceOrder: 1, title: 'Хлеб',
			type: 'expense', updatedAt: AT, updatedByUserId: 'duplicate'
		});
	}, null],
	['an invitation it accepted', async () => {
		await database.insert(householdInvitations).values({
			acceptedAt: AT, acceptedByUserId: 'duplicate', createdAt: AT, createdByUserId: 'sergei', expiresAt: AT, householdId: 'family',
			id: 'inv', tokenHash: 'b'.repeat(64)
		});
	}, null]
];

describe('assessDuplicate', () => {
	it('an empty duplicate without a household is mergeable', () => {
		expect(database.transaction((transaction) => assessDuplicate(transaction, 'duplicate')))
			.toEqual({ householdId: null, kind: 'mergeable' });
	});

	it('an empty duplicate alone in an empty household is mergeable with that household', async () => {
		await ownHousehold();

		expect(database.transaction((transaction) => assessDuplicate(transaction, 'duplicate')))
			.toEqual({ householdId: 'dup-home', kind: 'mergeable' });
	});

	it.each(withData)('has data with %s', async (_case, addData) => {
		await addData();

		expect(database.transaction((transaction) => assessDuplicate(transaction, 'duplicate'))).toEqual({ kind: 'has-data' });
	});
});

describe('mergeDuplicate refuses on its own', () => {
	it.each(withData)('rolls everything back for a duplicate with %s, even when told to merge', async (_case, addData, householdId) => {
		await addData();

		const before = snapshot();

		expect(() => database.transaction((transaction) => {
			mergeDuplicate(transaction, {
				duplicateHouseholdId: householdId,
				duplicateUserId: 'duplicate',
				identity: ANNA,
				linkUserId: 'sergei',
				now: NOW
			});
		})).toThrow(TransactionRollbackError);
		expect(snapshot()).toEqual(before);
	});

	it('merges an empty duplicate and its empty household', async () => {
		await ownHousehold();

		database.transaction((transaction) => {
			mergeDuplicate(transaction, {
				duplicateHouseholdId: 'dup-home',
				duplicateUserId: 'duplicate',
				identity: ANNA,
				linkUserId: 'sergei',
				now: NOW
			});
		});

		expect(await database.select({ id: users.id }).from(users)).toEqual([{ id: 'sergei' }]);
		expect(await database.select({ id: households.id }).from(households)).toEqual([{ id: 'family' }]);
		expect(await database.select().from(sessions)).toEqual([]);
		expect(await database.select({ telegramId: telegramAccounts.telegramId, userId: telegramAccounts.userId }).from(telegramAccounts))
			.toEqual([{ telegramId: '1001', userId: 'sergei' }]);
		expect(connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});
});
