import { readFileSync, rmSync } from 'node:fs';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import * as schema from '@/infrastructure/database/schema';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyMigrationsBefore } from './support/copy-migrations-before';

/**
 * DB-1, DB-2 and DB-3 of development/decisions/telegram-auth-and-households-v1.md, run the way
 * production runs them: a database at the last released migration, filled with data, then
 * `applyMigrations` (the same helper and folder as scripts/migrate-db.ts).
 */
const FIRST_NEW_MIGRATION = '0014_telegram_auth_and_invitations';
const DEFAULT_HOUSEHOLD_ID = 'default-household';
const OTHER_HOUSEHOLD_ID = 'household-2';
const T = 1_790_000_000_000;

type Row = Record<string, number | string | null>;
type SchemaObject = { name: string; sql: string | null; tbl_name: string; type: string };

let connection: Database.Database;
let folderBefore: string;

/**
 * Argon2id PHC string with a per-user hash part, so every user row stays distinguishable.
 */
function argonHash(seed: string): string {
	return `$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$${Buffer.from(seed).toString('base64').replaceAll('=', '')}`;
}

function insertRows(table: string, rows: Row[]): void {
	for (const row of rows) {
		const columns = Object.keys(row);
		const statement = connection.prepare(
			`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) `
			+ `VALUES (${columns.map((column) => `@${column}`).join(', ')})`
		);

		statement.run(row);
	}
}

function user(id: string, overrides: Row = {}): Row {
	return { created_at: T, display_name: id, id, is_active: 1, password_hash: argonHash(id), updated_at: T, username: id, ...overrides };
}

function session(id: string, userId: string, overrides: Row = {}): Row {
	return { created_at: T, expires_at: T + 1000, id, last_seen_at: T, token_hash: `hash-${id}`, user_id: userId, ...overrides };
}

function account(id: string, householdId: string, createdBy: string, overrides: Row = {}): Row {
	return {
		color: '#3f77a8', created_at: T, created_by_user_id: createdBy, currency: 'BYN', household_id: householdId, id,
		initial_balance_minor: 100_000, name: id, type: 'card', updated_at: T, ...overrides
	};
}

function operation(id: string, householdId: string, accountId: string, createdBy: string, overrides: Row = {}): Row {
	return {
		account_id: accountId, amount_in_household_base_currency_minor: 4790, amount_minor: 4790, created_at: T,
		created_by_user_id: createdBy, currency: 'BYN', exchange_rate: '1', exchange_rate_effective_on: '2026-10-01',
		exchange_rate_source: 'identity', happened_on: '2026-10-01',
		household_base_currency: 'BYN', household_id: householdId, id, source_order: 1, title: id, type: 'expense', updated_at: T,
		updated_by_user_id: createdBy, ...overrides
	};
}

/**
 * Fills the database at migration 0013 with every kind of row that references users or households.
 *
 * - alice owns the main household, erin (legacy placeholder hash) is a member of it;
 * - bob (active) and carol (inactive) have no membership, like the second family member on production;
 * - dave owns another household, which must stay untouched.
 */
function seedPopulatedDatabase(mainHouseholdId: string): void {
	const main = mainHouseholdId;

	insertRows('users', [
		user('alice'),
		user('bob', { created_at: T + 1 }),
		user('carol', { is_active: 0 }),
		user('dave'),
		user('erin', { password_hash: 'passkey-only-placeholder' })
	]);
	insertRows('households', [
		{ base_currency: 'BYN', created_at: T, id: main, name: 'Семья', updated_at: T },
		{ base_currency: 'BYN', created_at: T, id: OTHER_HOUSEHOLD_ID, name: 'Другая', updated_at: T }
	]);
	insertRows('household_members', [
		{ household_id: main, joined_at: T, role: 'owner', user_id: 'alice' },
		{ household_id: main, joined_at: T + 10, role: 'member', user_id: 'erin' },
		{ household_id: OTHER_HOUSEHOLD_ID, joined_at: T + 20, role: 'owner', user_id: 'dave' }
	]);
	insertRows('sessions', [
		session('s-alice-1', 'alice', { ip_address: '10.0.0.1', user_agent: 'Safari' }),
		session('s-alice-2', 'alice'),
		session('s-bob-1', 'bob'),
		session('s-dave-1', 'dave')
	]);
	insertRows('webauthn_credentials', [
		{
			backed_up: 1, counter: 3, created_at: T, device_name: 'iPhone', device_type: 'multiDevice', id: 'cred-alice', last_used_at: T,
			public_key: 'pk-a', transports: '["internal"]', user_id: 'alice'
		},
		{ created_at: T, device_type: 'singleDevice', id: 'cred-erin', public_key: 'pk-e', user_id: 'erin' }
	]);
	insertRows('webauthn_challenges', [
		{ challenge: 'ch-auth', created_at: T, expires_at: T + 60, id: 'ch-1', purpose: 'authentication', user_id: null },
		{
			challenge: 'ch-reg', consumed_at: T + 5, created_at: T, expires_at: T + 60, id: 'ch-2', purpose: 'registration',
			user_id: 'alice'
		}
	]);
	insertRows('accounts', [
		account('acc-1', main, 'alice', { details: '{"last4":"1234"}', owner: 'Алиса' }),
		account('acc-2', main, 'erin', { currency: 'USD', type: 'cash' }),
		account('acc-3', OTHER_HOUSEHOLD_ID, 'dave')
	]);
	insertRows('categories', [
		{
			color: '#aa0000', created_at: T, created_by_user_id: 'alice', household_id: main, id: 'cat-1', name: 'Продукты',
			normalized_name: 'продукты', updated_at: T
		}
	]);
	insertRows('category_keywords', [{ category_id: 'cat-1', normalized_value: 'ашан', position: 0, value: 'Ашан' }]);
	insertRows('contacts', [
		{
			color: '#00aa00', created_at: T, created_by_user_id: 'erin', household_id: main, id: 'con-1', name: 'Ашан',
			normalized_name: 'ашан', type: 'company', updated_at: T
		}
	]);
	insertRows('transfers', [
		{
			created_at: T, created_by_user_id: 'alice', exchange_from_currency: 'USD', exchange_rate: '3', exchange_to_currency: 'BYN',
			from_account_id: 'acc-2', from_amount_minor: 1000, happened_on: '2026-10-01', household_id: main, id: 'tr-1',
			to_account_id: 'acc-1', to_amount_minor: 3000, updated_at: T, updated_by_user_id: 'erin'
		}
	]);
	insertRows('operations', [
		operation('op-1', main, 'acc-1', 'alice', { category_id: 'cat-1', contact_id: 'con-1' }),
		operation('op-2', main, 'acc-1', 'bob', {
			deleted_at: T + 99, deleted_by_user_id: 'erin', source_order: 2, type: 'income', updated_by_user_id: 'carol'
		}),
		operation('op-3', main, 'acc-2', 'alice', { source_order: 3, transfer_id: 'tr-1' }),
		operation('op-4', main, 'acc-1', 'alice', { source_order: 4, transfer_id: 'tr-1', type: 'income' }),
		operation('op-5', OTHER_HOUSEHOLD_ID, 'acc-3', 'dave')
	]);
	insertRows('receipt_imports', [
		{
			account_id: 'acc-1', categories_snapshot_json: '[]', categories_snapshot_version: 'v1', created_at: T,
			created_by_user_id: 'erin', household_id: main, id: 'ri-1', image_content_type: 'image/jpeg', image_original_name: 'check.jpg',
			image_sha256: 'sha',
			image_size_bytes: 10, image_storage_key: 'key', status: 'approved', updated_at: T
		}
	]);
	insertRows('receipt_operation_links', [{ created_at: T, group_key: 'g-1', operation_id: 'op-1', receipt_import_id: 'ri-1' }]);
	insertRows('receipt_processing_jobs', [
		{ created_at: T, id: 'job-1', receipt_import_id: 'ri-1', requested_pipeline_version: 'v2', status: 'completed', updated_at: T }
	]);
	insertRows('exchange_rates', [
		{
			created_at: T, effective_on: '2026-10-01', from_currency: 'USD', id: 'rate-1', rate: '3.0000', source: 'nbrb',
			to_currency: 'BYN', updated_at: T
		}
	]);
	insertRows('exchange_rate_refreshes', [
		{ base_currency: 'BYN', created_at: T, id: 'refresh-1', requested_on: '2026-10-01', source: 'nbrb', updated_at: T }
	]);
}

function listTables(): string[] {
	return connection.prepare(
		'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\' AND name <> \'__drizzle_migrations\''
		+ ' ORDER BY name'
	).pluck().all() as string[];
}

/**
 * Every row of every table, in a stable order that does not depend on rowids (a rebuild reassigns them).
 */
function dumpTables(): Record<string, Row[]> {
	const dump: Record<string, Row[]> = {};

	for (const table of listTables()) {
		const columnCount = (connection.pragma(`table_info("${table}")`) as unknown[]).length;
		const order = Array.from({ length: columnCount }, (_, index) => index + 1).join(', ');

		dump[table] = connection.prepare(`SELECT * FROM "${table}" ORDER BY ${order}`).all() as Row[];
	}

	return dump;
}

/**
 * Tables, indexes, triggers and views with their DDL (SQLite's own autoindexes left out).
 */
function readSchemaObjects(): SchemaObject[] {
	return connection.prepare(
		'SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE \'sqlite_%\' ORDER BY type, name'
	).all() as SchemaObject[];
}

function countAppliedMigrations(): number {
	return connection.prepare('SELECT count(*) FROM __drizzle_migrations').pluck().get() as number;
}

function countJournalEntries(): number {
	return (JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as { entries: unknown[] }).entries.length;
}

function migrateToRelease(mainHouseholdId = DEFAULT_HOUSEHOLD_ID) {
	const database = drizzle(connection, { schema });

	migrate(database, { migrationsFolder: folderBefore });
	seedPopulatedDatabase(mainHouseholdId);

	return database;
}

function captureError(run: () => void): Error {
	try {
		run();
	}
	catch (error: unknown) {
		if (error instanceof Error) {
			return error;
		}

		throw error;
	}

	throw new Error('Expected the call to throw.');
}

function membershipsOf(userId: string): Row[] {
	return connection.prepare('SELECT household_id, role FROM household_members WHERE user_id = ? ORDER BY household_id')
		.all(userId) as Row[];
}

beforeEach(() => {
	folderBefore = copyMigrationsBefore(FIRST_NEW_MIGRATION);
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
});

afterEach(() => {
	connection.close();
	rmSync(folderBefore, { force: true, recursive: true });
});

describe('telegram auth and households migrations on a populated database', () => {
	it('keeps every row and every link, and the database stays consistent', () => {
		const database = migrateToRelease();
		const before = dumpTables();
		const startedAt = Date.now();

		applyMigrations(database, connection, './drizzle');

		const after = dumpTables();

		expect(connection.pragma('foreign_key_check')).toEqual([]);
		expect(connection.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(countAppliedMigrations()).toBe(countJournalEntries());

		// No cascade fired while `users` was rebuilt: every old table is identical, row for row.
		for (const table of Object.keys(before).filter((name) => name !== 'household_members')) {
			expect({ rows: after[table], table }).toEqual({ rows: before[table], table });
		}

		// household_members only gains rows (DB-3); the existing ones are untouched.
		expect(after.household_members).toEqual(expect.arrayContaining(before.household_members));
		expect(after.household_members).toHaveLength(before.household_members.length + 2);

		for (const userId of ['bob', 'carol']) {
			const [added] = connection.prepare('SELECT * FROM household_members WHERE user_id = ?').all(userId) as Row[];

			expect(added).toMatchObject({ household_id: DEFAULT_HOUSEHOLD_ID, role: 'member' });
			expect(Number(added.joined_at)).toBeGreaterThanOrEqual(Math.floor(startedAt / 1000) * 1000);
			expect(Number(added.joined_at)).toBeLessThanOrEqual(Date.now());
		}

		expect(after.telegram_accounts).toEqual([]);
		expect(after.telegram_login_requests).toEqual([]);
		expect(after.household_invitations).toEqual([]);
	});

	it('changes only users, the household_members user index and the three new tables in the schema', () => {
		const database = migrateToRelease();
		const before = readSchemaObjects();
		const usersColumnsBefore = connection.pragma('table_info(users)') as Row[];

		applyMigrations(database, connection, './drizzle');

		const after = readSchemaObjects();
		const changed = new Set(['household_members_user_id_idx', 'users']);
		const added = after.filter((object) => !before.some((old) => old.name === object.name)).map((object) => object.name);

		// Every other table and index keeps its exact DDL, including the foreign keys to users.
		expect(after.filter((object) => !changed.has(object.name) && !added.includes(object.name)))
			.toEqual(before.filter((object) => !changed.has(object.name)));
		expect(added.sort()).toEqual([
			'household_invitations',
			'household_invitations_household_id_idx',
			'household_invitations_token_hash_unique',
			'household_members_user_id_unique',
			'telegram_accounts',
			'telegram_accounts_telegram_id_unique',
			'telegram_login_requests',
			'telegram_login_requests_code_unique',
			'telegram_login_requests_expires_at_idx'
		]);
		expect(after.some((object) => object.name === 'household_members_user_id_idx')).toBe(false);
		expect(after.filter((object) => object.type === 'trigger' || object.type === 'view')).toEqual([]);

		// users: same columns, defaults and keys; only password_hash lost NOT NULL.
		expect(connection.pragma('table_info(users)')).toEqual(usersColumnsBefore.map((column) => (
			column.name === 'password_hash' ? { ...column, notnull: 0 } : column
		)));
		expect(connection.pragma('index_list(users)')).toEqual([
			expect.objectContaining({ name: 'users_username_unique', unique: 1 }),
			expect.objectContaining({ origin: 'pk', unique: 1 })
		]);
		expect(connection.pragma('index_list(household_members)')).toEqual(expect.arrayContaining([
			expect.objectContaining({ name: 'household_members_user_id_unique', unique: 1 })
		]));
	});

	it('creates the new tables with the foreign keys and delete rules of the decision', () => {
		const database = migrateToRelease();

		applyMigrations(database, connection, './drizzle');

		const foreignKeys = (table: string) => (connection.pragma(`foreign_key_list(${table})`) as Row[])
			.map((key) => `${key.from}->${key.table}.${key.to} ${key.on_delete}`)
			.sort();

		expect(foreignKeys('telegram_accounts')).toEqual(['user_id->users.id CASCADE']);
		expect(foreignKeys('telegram_login_requests')).toEqual(['link_user_id->users.id CASCADE']);
		expect(foreignKeys('household_invitations')).toEqual([
			'accepted_by_user_id->users.id NO ACTION',
			'created_by_user_id->users.id NO ACTION',
			'household_id->households.id CASCADE'
		]);

		const columns = (table: string) => Object.fromEntries((connection.pragma(`table_info(${table})`) as Row[])
			.map((column) => {
				const notNull = column.notnull === 1 ? ' NOT NULL' : '';
				const primaryKey = Number(column.pk) > 0 ? ' PK' : '';

				return [column.name, `${String(column.type).toLowerCase()}${notNull}${primaryKey}`];
			}));

		expect(columns('telegram_accounts')).toEqual({
			bot_blocked_at: 'integer',
			chat_id: 'text NOT NULL',
			first_name: 'text NOT NULL',
			last_name: 'text',
			last_sign_in_at: 'integer NOT NULL',
			linked_at: 'integer NOT NULL',
			telegram_id: 'text NOT NULL',
			updated_at: 'integer NOT NULL',
			user_id: 'text NOT NULL PK',
			username: 'text'
		});
		expect(columns('telegram_login_requests')).toEqual({
			chat_id: 'text',
			code: 'text NOT NULL',
			confirmed_at: 'integer',
			created_at: 'integer NOT NULL',
			expires_at: 'integer NOT NULL',
			first_name: 'text',
			id: 'text NOT NULL PK',
			ip_address: 'text',
			last_name: 'text',
			link_user_id: 'text',
			purpose: 'text NOT NULL',
			secret_hash: 'text NOT NULL',
			status: 'text NOT NULL',
			telegram_id: 'text',
			used_at: 'integer',
			user_agent: 'text',
			username: 'text'
		});
		expect(columns('household_invitations')).toEqual({
			accepted_at: 'integer',
			accepted_by_user_id: 'text',
			created_at: 'integer NOT NULL',
			created_by_user_id: 'text NOT NULL',
			expires_at: 'integer NOT NULL',
			household_id: 'text NOT NULL',
			id: 'text NOT NULL PK',
			revoked_at: 'integer',
			token_hash: 'text NOT NULL'
		});
	});

	it('enforces the new constraints after the migration', () => {
		const database = migrateToRelease();

		applyMigrations(database, connection, './drizzle');

		// DB-2: a Telegram user without a password; the username stays required and unique.
		insertRows('users', [user('zoe', { password_hash: null, username: 'tg-777' })]);
		expect(() => insertRows('users', [user('zoe-2', { password_hash: null, username: 'tg-777' })]))
			.toThrow(/UNIQUE constraint failed: users\.username/);
		expect(() => insertRows('users', [user('no-name', { password_hash: null, username: null })]))
			.toThrow(/NOT NULL constraint failed: users\.username/);

		// DB-3: one household per user.
		const secondMembership = { household_id: OTHER_HOUSEHOLD_ID, joined_at: T, role: 'member', user_id: 'alice' };

		expect(() => insertRows('household_members', [secondMembership]))
			.toThrow(/UNIQUE constraint failed: household_members\.user_id/);

		// DB-1: one Telegram per user and one user per Telegram.
		const telegram = { chat_id: '777', first_name: 'Zoe', last_sign_in_at: T, linked_at: T, updated_at: T };

		insertRows('telegram_accounts', [{ ...telegram, telegram_id: '777', user_id: 'zoe' }]);
		expect(() => insertRows('telegram_accounts', [{ ...telegram, telegram_id: '777', user_id: 'alice' }]))
			.toThrow(/UNIQUE constraint failed: telegram_accounts\.telegram_id/);
		expect(() => insertRows('telegram_accounts', [{ ...telegram, telegram_id: '778', user_id: 'zoe' }]))
			.toThrow(/UNIQUE constraint failed: telegram_accounts\.user_id/);
		expect(() => insertRows('telegram_accounts', [{ ...telegram, telegram_id: '779', user_id: 'nobody' }]))
			.toThrow(/FOREIGN KEY constraint failed/);

		const request = { created_at: T, expires_at: T + 600_000, purpose: 'link', secret_hash: 'secret-hash', status: 'pending' };

		insertRows('telegram_login_requests', [{ ...request, code: 'code-1', id: 'req-1', link_user_id: 'zoe' }]);
		expect(() => insertRows('telegram_login_requests', [{ ...request, code: 'code-1', id: 'req-2', link_user_id: null }]))
			.toThrow(/UNIQUE constraint failed: telegram_login_requests\.code/);

		const invitation = { created_at: T, created_by_user_id: 'alice', expires_at: T + 1000, household_id: DEFAULT_HOUSEHOLD_ID };

		insertRows('household_invitations', [{ ...invitation, id: 'inv-1', token_hash: 'token-hash' }]);
		expect(() => insertRows('household_invitations', [{ ...invitation, id: 'inv-2', token_hash: 'token-hash' }]))
			.toThrow(/UNIQUE constraint failed: household_invitations\.token_hash/);

		// Cascades: Telegram rows go with their user, invitations with their household.
		connection.prepare('DELETE FROM users WHERE id = ?').run('zoe');
		expect(dumpTables().telegram_accounts).toEqual([]);
		expect(dumpTables().telegram_login_requests).toEqual([]);

		insertRows('household_invitations', [{ ...invitation, household_id: OTHER_HOUSEHOLD_ID, id: 'inv-3', token_hash: 'other-hash' }]);
		connection.prepare('DELETE FROM operations WHERE household_id = ?').run(OTHER_HOUSEHOLD_ID);
		connection.prepare('DELETE FROM households WHERE id = ?').run(OTHER_HOUSEHOLD_ID);
		expect((dumpTables().household_invitations).map((row) => row.id)).toEqual(['inv-1']);
	});

	it('does not invent memberships when default-household does not exist', () => {
		const database = migrateToRelease('household-1');

		applyMigrations(database, connection, './drizzle');

		expect(membershipsOf('alice')).toEqual([{ household_id: 'household-1', role: 'owner' }]);
		expect(membershipsOf('bob')).toEqual([]);
		expect(membershipsOf('carol')).toEqual([]);
		expect(connection.pragma('foreign_key_check')).toEqual([]);
	});

	it('keeps existing roles and households of members', () => {
		const database = migrateToRelease();

		applyMigrations(database, connection, './drizzle');

		expect(membershipsOf('alice')).toEqual([{ household_id: DEFAULT_HOUSEHOLD_ID, role: 'owner' }]);
		expect(membershipsOf('erin')).toEqual([{ household_id: DEFAULT_HOUSEHOLD_ID, role: 'member' }]);
		expect(membershipsOf('dave')).toEqual([{ household_id: OTHER_HOUSEHOLD_ID, role: 'owner' }]);
	});

	it('refuses to rebuild users with foreign keys on instead of cascading into sessions and passkeys', () => {
		const database = migrateToRelease();
		const rowsBefore = dumpTables();
		const schemaBefore = readSchemaObjects();

		// Plain migrate keeps foreign keys on: without the guard, DROP TABLE users would delete the
		// rows of every ON DELETE CASCADE child (or fail late on the NO ACTION ones).
		const failure = captureError(() => migrate(database, { migrationsFolder: './drizzle' }));

		expect(String(failure.cause)).toMatch(/CHECK constraint failed: users_rebuild_requires_foreign_keys_off_use_apply_migrations/);
		expect(dumpTables()).toEqual(rowsBefore);
		expect(readSchemaObjects()).toEqual(schemaBefore);
	});

	it('fails loudly and changes nothing at all when a user belongs to two households', () => {
		const database = migrateToRelease();

		insertRows('household_members', [{ household_id: OTHER_HOUSEHOLD_ID, joined_at: T + 30, role: 'member', user_id: 'alice' }]);

		const rowsBefore = dumpTables();
		const schemaBefore = readSchemaObjects();
		const appliedBefore = countAppliedMigrations();

		const failure = captureError(() => applyMigrations(database, connection, './drizzle'));

		// Drizzle names the failed statement; the SQLite error with the reason is its cause (both reach the log).
		expect(failure.message).toContain('CREATE UNIQUE INDEX `household_members_user_id_unique`');
		expect(String(failure.cause)).toMatch(/UNIQUE constraint failed: household_members\.user_id/);

		// All pending migrations share one transaction: DB-1 and DB-2 are rolled back with DB-3.
		expect(dumpTables()).toEqual(rowsBefore);
		expect(readSchemaObjects()).toEqual(schemaBefore);
		expect(countAppliedMigrations()).toBe(appliedBefore);
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(connection.pragma('integrity_check', { simple: true })).toBe('ok');
	});
});
