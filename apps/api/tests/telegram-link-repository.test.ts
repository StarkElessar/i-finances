import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { telegramAccounts, telegramLoginRequests, users } from '@/infrastructure/database/schema';
import {
	hashTelegramLoginSecret,
	type TelegramIdentity,
	TelegramLinkRepository,
	TelegramLoginRequestRepository
} from '@/modules/telegram-auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `TelegramLinkRepository.complete` consumes a link request by its own conditions, whatever the service checked
 * before: each condition of the conditional update is tested alone (the service checks are the first line).
 */

const CREATED = new Date('2026-10-18T10:00:00.000Z');
const LATER = new Date('2026-10-18T10:05:00.000Z');
const AFTER_EXPIRY = new Date('2026-10-18T10:11:00.000Z');
const SECRET_HASH = hashTelegramLoginSecret('browser-secret');
const ANNA: TelegramIdentity = { chatId: '1001', firstName: 'Анна', lastName: null, telegramId: '1001', username: 'anna_k' };

let connection: Database.Database;
let database: AppDatabase;
let links: TelegramLinkRepository;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	links = new TelegramLinkRepository(database);
	await database.insert(users).values(['sergei', 'olga'].map((id) => ({
		createdAt: CREATED, displayName: id, id, isActive: true, passwordHash: 'hash', updatedAt: CREATED, username: id
	})));

	const requests = new TelegramLoginRequestRepository(database);

	await requests.insert({
		code: 'linkcode00000000000000000000000a',
		createdAt: CREATED,
		expiresAt: new Date(CREATED.getTime() + 10 * 60 * 1000),
		id: 'link-request',
		linkUserId: 'sergei',
		purpose: 'link',
		secretHash: SECRET_HASH
	});
	await requests.insert({
		code: 'signincode000000000000000000000a',
		createdAt: CREATED,
		expiresAt: new Date(CREATED.getTime() + 10 * 60 * 1000),
		id: 'sign-in-request',
		linkUserId: 'sergei',
		purpose: 'sign-in',
		secretHash: SECRET_HASH
	});
	await requests.confirm({ id: 'link-request', identity: ANNA, now: LATER });
	await requests.confirm({ id: 'sign-in-request', identity: ANNA, now: LATER });
});

afterEach(() => {
	connection.close();
});

function statusOf(id: string): string | undefined {
	return database.select({ status: telegramLoginRequests.status }).from(telegramLoginRequests)
		.where(eq(telegramLoginRequests.id, id)).get()?.status;
}

describe('TelegramLinkRepository.complete', () => {
	it('links for the right user, browser, purpose, status and time, once', async () => {
		const input = { linkUserId: 'sergei', now: LATER, requestId: 'link-request', secretHash: SECRET_HASH };

		expect(await links.complete(input)).toEqual({ kind: 'linked', mergedUserId: null, username: 'anna_k' });
		expect(await links.complete(input)).toEqual({ kind: 'not-consumed' });
		expect(await database.select({ userId: telegramAccounts.userId }).from(telegramAccounts)).toEqual([{ userId: 'sergei' }]);
	});

	it.each([
		['another user', { linkUserId: 'olga' }],
		['another browser', { secretHash: hashTelegramLoginSecret('other-secret') }],
		['a sign-in request', { requestId: 'sign-in-request' }],
		['an expired request', { now: AFTER_EXPIRY }]
	])('consumes nothing for %s', async (_case, change) => {
		const input = { linkUserId: 'sergei', now: LATER, requestId: 'link-request', secretHash: SECRET_HASH, ...change };

		expect(await links.complete(input)).toEqual({ kind: 'not-consumed' });
		expect([statusOf('link-request'), statusOf('sign-in-request')]).toEqual(['confirmed', 'confirmed']);
		expect(await database.select().from(telegramAccounts)).toEqual([]);
	});

	it('a merge statement that changes nothing rolls back the request too and answers 409, never «linked»', async () => {
		await database.insert(users).values({
			createdAt: CREATED, displayName: 'Анна', id: 'duplicate', isActive: true, passwordHash: null, updatedAt: CREATED,
			username: 'tg-1001'
		});
		await database.insert(telegramAccounts).values({
			chatId: '1001', firstName: 'Анна', lastName: null, lastSignInAt: CREATED, linkedAt: CREATED, telegramId: '1001',
			updatedAt: CREATED, userId: 'duplicate', username: null
		});
		// Stands in for a rule the assessment does not know: the duplicate looks empty, but its row refuses to go.
		connection.exec('CREATE TEMP TRIGGER keep_duplicate BEFORE DELETE ON users BEGIN SELECT RAISE(IGNORE); END');

		expect(await links.complete({ linkUserId: 'sergei', now: LATER, requestId: 'link-request', secretHash: SECRET_HASH }))
			.toEqual({ kind: 'telegram-linked-elsewhere' });
		expect(statusOf('link-request')).toBe('confirmed');
		expect(await database.select({ userId: telegramAccounts.userId }).from(telegramAccounts)).toEqual([{ userId: 'duplicate' }]);
		expect(await database.select({ id: users.id }).from(users).orderBy(users.id)).toEqual([
			{ id: 'duplicate' }, { id: 'olga' }, { id: 'sergei' }
		]);
	});

	it('consumes nothing that is not confirmed', async () => {
		database.update(telegramLoginRequests).set({ status: 'pending' }).where(eq(telegramLoginRequests.id, 'link-request')).run();

		expect(await links.complete({ linkUserId: 'sergei', now: LATER, requestId: 'link-request', secretHash: SECRET_HASH }))
			.toEqual({ kind: 'not-consumed' });
		expect(await database.select().from(telegramAccounts)).toEqual([]);
	});
});
