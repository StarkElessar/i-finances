import { rmSync } from 'node:fs';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import * as schema from '@/infrastructure/database/schema';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyMigrationsBefore } from './support/copy-migrations-before';

/**
 * Migration 0017 (`development/decisions/app-invitations-v1.md`), run the way production runs it: a database at
 * 0016 filled with data, then `applyMigrations` over `./drizzle`. 0017 only adds: the table `app_invitations` and two
 * nullable columns (`household_invitations.registered_user_id`, `telegram_login_requests.invitation_token_hash`)
 * through `ALTER TABLE ... ADD`, so no table is rebuilt and no row can be lost.
 */
const MIGRATION_UNDER_TEST = '0017_app_invitations';
const T = 1_792_000_000_000;

type Row = Record<string, number | string | null>;
type SchemaObject = { name: string; sql: string | null; tbl_name: string; type: string };

let connection: Database.Database;
let folderBefore: string;

function insertRows(table: string, rows: Row[]): void {
	for (const row of rows) {
		const columns = Object.keys(row);

		const names = columns.map((column) => `"${column}"`).join(', ');
		const values = columns.map((column) => `@${column}`).join(', ');

		connection.prepare(`INSERT INTO "${table}" (${names}) VALUES (${values})`).run(row);
	}
}

function user(id: string, overrides: Row = {}): Row {
	return { created_at: T, display_name: id, id, is_active: 1, password_hash: null, updated_at: T, username: id, ...overrides };
}

/** Everything that hangs on users and on the two tables that get a column. */
function seed(): void {
	insertRows('users', [user('stark', { password_hash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA' }), user('anna'), user('tg-1001')]);
	insertRows('households', [{ base_currency: 'BYN', created_at: T, id: 'default-household', name: 'Семья', updated_at: T }]);
	insertRows('household_members', [
		{ household_id: 'default-household', joined_at: T, role: 'owner', user_id: 'stark' },
		{ household_id: 'default-household', joined_at: T, role: 'member', user_id: 'anna' }
	]);
	insertRows('sessions', [{ created_at: T, expires_at: T + 1000, id: 's-1', last_seen_at: T, token_hash: 'hash-s-1', user_id: 'stark' }]);
	insertRows('telegram_accounts', [{
		chat_id: '1001', first_name: 'Анна', last_sign_in_at: T, linked_at: T, telegram_id: '1001', updated_at: T, user_id: 'tg-1001'
	}]);
	insertRows('household_invitations', [
		{
			created_at: T, created_by_user_id: 'stark', expires_at: T + 1000, household_id: 'default-household', id: 'inv-active',
			token_hash: 'h-1'
		},
		{
			accepted_at: T + 5, accepted_by_user_id: 'anna', created_at: T, created_by_user_id: 'stark', expires_at: T + 1000,
			household_id: 'default-household', id: 'inv-used', token_hash: 'h-2'
		},
		{
			created_at: T, created_by_user_id: 'stark', expires_at: T + 1000, household_id: 'default-household', id: 'inv-revoked',
			revoked_at: T + 1, token_hash: 'h-3'
		}
	]);
	insertRows('telegram_login_requests', [
		{ code: 'code-1', created_at: T, expires_at: T + 600_000, id: 'req-1', purpose: 'sign-in', secret_hash: 'sh-1', status: 'pending' },
		{
			code: 'code-2', created_at: T, expires_at: T + 600_000, id: 'req-2', link_user_id: 'anna', purpose: 'link', secret_hash: 'sh-2',
			status: 'confirmed', telegram_id: '2002', first_name: 'Анна', chat_id: '2002', confirmed_at: T + 1
		}
	]);
}

function listTables(): string[] {
	return connection.prepare(
		'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\''
		+ ' AND name <> \'__drizzle_migrations\' ORDER BY name'
	).pluck().all() as string[];
}

function dumpTables(): Record<string, Row[]> {
	return Object.fromEntries(listTables().map((table) => [
		table,
		connection.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() as Row[]
	]));
}

function readSchemaObjects(): SchemaObject[] {
	return connection.prepare(
		'SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE \'sqlite_%\' ORDER BY type, name'
	).all() as SchemaObject[];
}

function migrateToPrevious() {
	const database = drizzle(connection, { schema });

	migrate(database, { migrationsFolder: folderBefore });
	seed();

	return database;
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

describe('migration 0017: invitations into the application', () => {
	it('keeps every row; the two new columns are NULL in every old row; the database stays consistent', () => {
		const database = migrateToPrevious();
		const before = dumpTables();

		applyMigrations(database, connection, './drizzle');

		const after = dumpTables();

		expect(connection.pragma('foreign_key_check')).toEqual([]);
		expect(connection.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);

		for (const table of Object.keys(before)) {
			const added = table === 'household_invitations'
				? { registered_user_id: null }
				: table === 'telegram_login_requests' ? { invitation_token_hash: null } : {};

			expect({ rows: after[table], table }).toEqual({ rows: before[table].map((row) => ({ ...row, ...added })), table });
		}

		expect(after.app_invitations).toEqual([]);
	});

	it('changes nothing else in the schema: one new table with its indexes, two added columns, no rebuild', () => {
		const database = migrateToPrevious();
		const before = readSchemaObjects();

		applyMigrations(database, connection, './drizzle');

		const after = readSchemaObjects();
		const changed = new Set(['household_invitations', 'telegram_login_requests']);
		const added = after.filter((object) => !before.some((old) => old.name === object.name)).map((object) => object.name).sort();

		expect(added).toEqual(['app_invitations', 'app_invitations_created_at_idx', 'app_invitations_token_hash_unique']);
		expect(after.filter((object) => !changed.has(object.name) && !added.includes(object.name)))
			.toEqual(before.filter((object) => !changed.has(object.name)));

		// The two tables: the old DDL with one column definition inserted (ALTER TABLE ADD), nothing dropped or renamed.
		const compact = (text: string) => text.replace(/\s+/gu, '');
		const addedColumns: Record<string, string> = {
			household_invitations: '`registered_user_id` text REFERENCES users(id)',
			telegram_login_requests: '`invitation_token_hash` text'
		};

		for (const table of changed) {
			const oldSql = compact(before.find((object) => object.name === table)?.sql ?? '');
			const newSql = compact(after.find((object) => object.name === table)?.sql ?? '');
			const definition = compact(addedColumns[table]);

			expect([newSql.replace(`${definition},`, ''), newSql.replace(`,${definition}`, '')], table).toContain(oldSql);
		}

		const columns = (table: string) => (connection.pragma(`table_info(${table})`) as Row[])
			.map((column) => `${column.name} ${String(column.type).toLowerCase()} ${column.notnull}`);

		expect(columns('household_invitations').at(-1)).toBe('registered_user_id text 0');
		expect(columns('telegram_login_requests').at(-1)).toBe('invitation_token_hash text 0');
		expect(columns('app_invitations')).toEqual([
			'id text 1',
			'token_hash text 1',
			'created_by_user_id text 1',
			'note text 0',
			'expires_at integer 1',
			'created_at integer 1',
			'accepted_at integer 0',
			'accepted_by_user_id text 0',
			'revoked_at integer 0'
		]);

		const foreignKeys = (table: string) => (connection.pragma(`foreign_key_list(${table})`) as Row[])
			.map((key) => `${key.from}->${key.table}.${key.to} ${key.on_delete}`)
			.sort();

		expect(foreignKeys('app_invitations')).toEqual([
			'accepted_by_user_id->users.id NO ACTION',
			'created_by_user_id->users.id NO ACTION'
		]);
		expect(foreignKeys('household_invitations')).toContain('registered_user_id->users.id NO ACTION');
	});

	it('enforces the new constraints', () => {
		const database = migrateToPrevious();

		applyMigrations(database, connection, './drizzle');

		const invitation = { created_at: T, created_by_user_id: 'stark', expires_at: T + 1000 };

		insertRows('app_invitations', [{ ...invitation, id: 'app-1', note: 'Для Марии', token_hash: 'a-1' }]);
		expect(() => insertRows('app_invitations', [{ ...invitation, id: 'app-2', token_hash: 'a-1' }]))
			.toThrow(/UNIQUE constraint failed: app_invitations\.token_hash/);
		expect(() => insertRows('app_invitations', [{ ...invitation, created_by_user_id: 'nobody', id: 'app-3', token_hash: 'a-3' }]))
			.toThrow(/FOREIGN KEY constraint failed/);
		expect(() => connection.prepare('UPDATE household_invitations SET registered_user_id = ? WHERE id = ?').run('nobody', 'inv-active'))
			.toThrow(/FOREIGN KEY constraint failed/);
		// Users are never deleted (Р7); the references do not cascade.
		connection.prepare('UPDATE app_invitations SET accepted_at = ?, accepted_by_user_id = ? WHERE id = ?')
			.run(T + 2, 'tg-1001', 'app-1');
		expect(() => connection.prepare('DELETE FROM users WHERE id = ?').run('tg-1001')).toThrow(/FOREIGN KEY constraint failed/);
	});

	it('applies on an empty database, and a second run applies nothing', () => {
		const database = drizzle(connection, { schema });

		applyMigrations(database, connection, './drizzle');

		const schemaAfter = readSchemaObjects();

		applyMigrations(database, connection, './drizzle');

		expect(readSchemaObjects()).toEqual(schemaAfter);
		expect(connection.pragma('foreign_key_check')).toEqual([]);
	});
});
