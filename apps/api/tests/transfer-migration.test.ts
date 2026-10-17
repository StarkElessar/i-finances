import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	householdMembers,
	households,
	operations,
	transfers,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { createTransferRepository, createTransferService } from '@/modules/transfer';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const FIXED_DATE = new Date('2026-09-06T10:00:00.000Z');
const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const LAST_MIGRATION_TAG = '0012_swift_valeria_richards';

type Journal = { entries: { tag: string }[] };

let connection: Database.Database;
let folderBeforeLast: string;

/**
 * Copies the migrations folder with the journal cut before the last migration.
 */
function copyMigrationsWithoutLast(): string {
	const folder = mkdtempSync(join(tmpdir(), 'if-migrations-'));

	cpSync('./drizzle', folder, { recursive: true });

	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;

	journal.entries = journal.entries.filter((entry) => entry.tag !== LAST_MIGRATION_TAG);
	writeFileSync(journalPath, JSON.stringify(journal));

	return folder;
}

beforeEach(() => {
	folderBeforeLast = copyMigrationsWithoutLast();
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
});

afterEach(() => {
	connection.close();
	rmSync(folderBeforeLast, { force: true, recursive: true });
});

describe('same-currency transfers migration', () => {
	it('keeps existing transfers and their ledger legs', async () => {
		const database = drizzle(connection, { schema });

		migrate(database, { migrationsFolder: folderBeforeLast });

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

		for (const [id, currency] of [['account-usd', 'USD'], ['account-byn', 'BYN']] as const) {
			await database.insert(accounts).values({
				archivedAt: null,
				color: '#3f77a8',
				createdAt: FIXED_DATE,
				createdByUserId: USER_ID,
				currency,
				description: '',
				householdId: HOUSEHOLD_ID,
				id,
				initialBalanceMinor: 100_000,
				isColorAccentEnabled: false,
				isIncludedInFamilyTotal: true,
				name: id,
				type: 'card',
				updatedAt: FIXED_DATE,
				version: 1
			});
		}

		let sequence = 0;
		const created = await createTransferService({
			accountRepository: new AccountRepository(database),
			contactRepository: new ContactRepository(database),
			createId: () => `id-${++sequence}`,
			exchangeRateResolver: new ExchangeRateService(new ExchangeRateRepository(database)),
			householdResolver: new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE),
			now: () => FIXED_DATE,
			transferRepository: createTransferRepository(database)
		}).create(USER_ID, {
			comment: '',
			contactId: null,
			exchangeRate: '3',
			fromAccountId: 'account-usd',
			fromAmountMinor: 10_000,
			happenedOn: '2026-09-06',
			toAccountId: 'account-byn'
		});

		// Same helper and migrations folder as scripts/migrate-db.ts.
		applyMigrations(database, connection, './drizzle');

		expect(connection.pragma('foreign_key_check')).toEqual([]);
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);

		const [kept] = await database.select().from(transfers).where(eq(transfers.id, created.id));

		expect(kept).toMatchObject({ exchangeRate: '3', toAmountMinor: 30_000 });

		const legs = await database.select().from(operations).where(eq(operations.transferId, created.id));

		expect(legs).toHaveLength(2);
	});
});
