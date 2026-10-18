import { readFileSync, rmSync } from 'node:fs';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import * as schema from '@/infrastructure/database/schema';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyMigrationsBefore } from './support/copy-migrations-before';

/**
 * 0012 rebuilds `transfers` without `transfers_different_currencies_check`. The database is
 * seeded with raw SQL at the schema right before 0012: today's Drizzle schema and services
 * expect columns of later migrations (0013 `accounts.owner`), so they cannot write there.
 */
const MIGRATION_UNDER_TEST = '0012_swift_valeria_richards';
const T = 1_790_000_000_000;

let connection: Database.Database;
let folderBefore: string;

function run(statement: string): void {
	connection.prepare(statement).run();
}

function seedBeforeMigration(): void {
	run(`INSERT INTO users (id, username, display_name, password_hash, is_active, created_at, updated_at)
		VALUES ('user-1', 'sergei', 'Sergei Test', 'hash', 1, ${T}, ${T})`);
	run(`INSERT INTO households (id, name, base_currency, created_at, updated_at)
		VALUES ('household-1', 'Семья', 'BYN', ${T}, ${T})`);
	run(`INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES ('household-1', 'user-1', 'owner', ${T})`);

	for (const [id, currency] of [['account-usd', 'USD'], ['account-byn', 'BYN'], ['account-byn-2', 'BYN']]) {
		run(`INSERT INTO accounts (id, household_id, name, type, currency, color, initial_balance_minor,
			created_by_user_id, created_at, updated_at)
			VALUES ('${id}', 'household-1', '${id}', 'card', '${currency}', '#3f77a8', 100000,
			'user-1', ${T}, ${T})`);
	}

	run(`INSERT INTO transfers (id, household_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor,
		exchange_from_currency, exchange_to_currency, exchange_rate, happened_on, created_by_user_id, updated_by_user_id,
		created_at, updated_at)
		VALUES ('transfer-1', 'household-1', 'account-usd', 'account-byn', 10000, 30000, 'USD', 'BYN', '3', '2026-09-06',
		'user-1', 'user-1', ${T}, ${T})`);

	for (const [id, accountId, type, amount, currency, order] of [
		['leg-out', 'account-usd', 'expense', 10000, 'USD', 1],
		['leg-in', 'account-byn', 'income', 30000, 'BYN', 2]
	]) {
		run(`INSERT INTO operations (id, household_id, account_id, type, amount_minor, currency, amount_in_household_base_currency_minor,
			household_base_currency, happened_on, source_order, title, exchange_rate, exchange_rate_effective_on, exchange_rate_source,
			created_by_user_id, updated_by_user_id, created_at, updated_at, transfer_id)
			VALUES ('${id}', 'household-1', '${accountId}', '${type}', ${amount}, '${currency}', 30000, 'BYN', '2026-09-06', ${order},
			'Перевод', '1', '2026-09-06', 'identity', 'user-1', 'user-1', ${T}, ${T}, 'transfer-1')`);
	}
}

function insertSameCurrencyTransfer(): void {
	run(`INSERT INTO transfers (id, household_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor,
		exchange_from_currency, exchange_to_currency, exchange_rate, happened_on, created_by_user_id, updated_by_user_id,
		created_at, updated_at)
		VALUES ('transfer-2', 'household-1', 'account-byn', 'account-byn-2', 500, 500, 'BYN', 'BYN', '1', '2026-09-06',
		'user-1', 'user-1', ${T}, ${T})`);
}

beforeEach(() => {
	folderBefore = copyMigrationsBefore(MIGRATION_UNDER_TEST);
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
});

afterEach(() => {
	connection.close();
	rmSync(folderBefore, { force: true, recursive: true });
});

describe('same-currency transfers migration', () => {
	it('keeps existing transfers and their ledger legs, and then allows same-currency transfers', () => {
		const database = drizzle(connection, { schema });

		migrate(database, { migrationsFolder: folderBefore });
		seedBeforeMigration();

		// The schema before 0012 still forbids a transfer between two accounts of one currency.
		expect(insertSameCurrencyTransfer).toThrow(/CHECK constraint failed: transfers_different_currencies_check/);

		const transfersBefore = connection.prepare('SELECT * FROM transfers ORDER BY id').all();
		const legsBefore = connection.prepare('SELECT * FROM operations ORDER BY id').all();

		// Same helper and migrations folder as scripts/migrate-db.ts.
		applyMigrations(database, connection, './drizzle');

		const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] };

		expect(connection.prepare('SELECT count(*) FROM __drizzle_migrations').pluck().get()).toBe(journal.entries.length);
		expect(connection.pragma('foreign_key_check')).toEqual([]);
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(connection.prepare('SELECT * FROM transfers ORDER BY id').all()).toEqual(transfersBefore);
		expect(connection.prepare('SELECT * FROM operations ORDER BY id').all()).toEqual(legsBefore);

		insertSameCurrencyTransfer();

		expect(connection.prepare('SELECT count(*) FROM transfers').pluck().get()).toBe(2);
	});
});
