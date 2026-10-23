import { rmSync } from 'node:fs';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import * as schema from '@/infrastructure/database/schema';
import { hasHouseholdCreationRight } from '@/modules/household';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { copyMigrationsBefore } from './support/copy-migrations-before';

/**
 * Migration 0018 (`development/decisions/app-invitations-v1.md`, section 13), run the way production runs it: a
 * database at 0017 filled with data shaped like production (the family household with two owners from the old
 * auto-provisioning and members who came by invitation, a second household, a former owner, people signed up with
 * both kinds of invitation), then `applyMigrations` over `./drizzle`. 0018 adds the nullable column
 * `users.first_household_owner_at` through `ALTER TABLE ... ADD` (no rebuild) and fills it in for the current owners
 * only; nothing else changes. A former owner is not guessed from the household invitations they created (owner's
 * decision 2026-10-23): that would give the right back to a person demoted to member by hand, like `vicotya`.
 */
const MIGRATION_UNDER_TEST = '0018_household_creation_right';
const T = 1_793_000_000_000;

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

function householdInvitation(id: string, createdBy: string, createdAt: number, overrides: Row = {}): Row {
	return {
		created_at: createdAt, created_by_user_id: createdBy, expires_at: createdAt + 1000, household_id: 'default-household', id,
		token_hash: `hash-${id}`, ...overrides
	};
}

/**
 * - `stark`, `anna`: owners of «Семья» (the old resolver made everybody who signed in an owner), `anna` joined later;
 * - `olga`: was an owner of «Семья», created invitations there and left (no membership now);
 * - `vicotya`: was an owner of «Семья», created an invitation there, then was demoted to member by hand (SQL);
 * - `petr`: the owner of a second household, `petr-wife` its member;
 * - `tg-1001`: signed up with a household invitation and joined; `tg-1003`: signed up with one and never joined;
 * - `ivan`: accepted a household invitation with an existing account; `loner`: no membership, nothing;
 * - `tg-1002`: signed up with an invitation into the application, no household yet.
 */
function seed(): void {
	insertRows('users', [
		user('stark', { password_hash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA' }),
		user('anna'),
		user('olga'),
		user('vicotya'),
		user('petr'),
		user('petr-wife'),
		user('ivan'),
		user('loner', { is_active: 0 }),
		user('tg-1001'),
		user('tg-1002'),
		user('tg-1003')
	]);
	insertRows('households', [
		{ base_currency: 'BYN', created_at: T, id: 'default-household', name: 'Семья', updated_at: T },
		{ base_currency: 'BYN', created_at: T + 100, id: 'household-2', name: 'Петровы', updated_at: T + 100 }
	]);
	insertRows('household_members', [
		{ household_id: 'default-household', joined_at: T, role: 'owner', user_id: 'stark' },
		{ household_id: 'default-household', joined_at: T + 1, role: 'owner', user_id: 'anna' },
		{ household_id: 'default-household', joined_at: T + 2, role: 'member', user_id: 'tg-1001' },
		{ household_id: 'default-household', joined_at: T + 3, role: 'member', user_id: 'ivan' },
		{ household_id: 'default-household', joined_at: T + 4, role: 'member', user_id: 'vicotya' },
		{ household_id: 'household-2', joined_at: T + 100, role: 'owner', user_id: 'petr' },
		{ household_id: 'household-2', joined_at: T + 101, role: 'member', user_id: 'petr-wife' }
	]);
	insertRows('sessions', [{ created_at: T, expires_at: T + 1000, id: 's-1', last_seen_at: T, token_hash: 'hash-s-1', user_id: 'stark' }]);
	insertRows('telegram_accounts', [
		{ chat_id: '1001', first_name: 'Тг', last_sign_in_at: T, linked_at: T, telegram_id: '1001', updated_at: T, user_id: 'tg-1001' },
		{ chat_id: '1002', first_name: 'Тг', last_sign_in_at: T, linked_at: T, telegram_id: '1002', updated_at: T, user_id: 'tg-1002' }
	]);
	insertRows('household_invitations', [
		householdInvitation('inv-stark-late', 'stark', T + 50, { accepted_at: T + 51, accepted_by_user_id: 'ivan' }),
		householdInvitation('inv-registered', 'stark', T + 60, {
			accepted_at: T + 62, accepted_by_user_id: 'tg-1001', registered_user_id: 'tg-1001'
		}),
		householdInvitation('inv-not-joined', 'stark', T + 70, { registered_user_id: 'tg-1003' }),
		householdInvitation('inv-olga-1', 'olga', T + 30, { revoked_at: T + 40 }),
		householdInvitation('inv-olga-0', 'olga', T + 20, { revoked_at: T + 40 }),
		householdInvitation('inv-vicotya', 'vicotya', T + 10, { accepted_at: T + 12, accepted_by_user_id: 'ivan' })
	]);
	insertRows('app_invitations', [
		{
			accepted_at: T + 80, accepted_by_user_id: 'tg-1002', created_at: T + 75, created_by_user_id: 'stark', expires_at: T + 9000,
			id: 'app-1',
			token_hash: 'app-hash-1'
		},
		{ created_at: T + 90, created_by_user_id: 'stark', expires_at: T + 9000, id: 'app-2', note: 'Для Марии', token_hash: 'app-hash-2' }
	]);
	insertRows('telegram_login_requests', [
		{
			code: 'code-1', created_at: T, expires_at: T + 600_000, id: 'req-1', purpose: 'sign-in', secret_hash: 'sh-1', status: 'pending',
			invitation_token_hash: 'app-hash-2'
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

describe('migration 0018: the right to found a household', () => {
	it('keeps every row, fills the new column for current owners only, stays consistent', () => {
		const database = migrateToPrevious();
		const before = dumpTables();

		applyMigrations(database, connection, './drizzle');

		const after = dumpTables();
		const expected: Record<string, number | null> = {
			anna: T + 1,
			ivan: null,
			loner: null,
			// Created invitations as an owner and left: not written down (no owner membership now).
			olga: null,
			petr: T + 100,
			'petr-wife': null,
			// The owner membership counts, not the later invitations.
			stark: T,
			'tg-1001': null,
			'tg-1002': null,
			'tg-1003': null,
			// Demoted to member by hand, with old invitations of hers: not written down.
			vicotya: null
		};

		expect(connection.pragma('foreign_key_check')).toEqual([]);
		expect(connection.pragma('integrity_check', { simple: true })).toBe('ok');
		expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);

		for (const table of Object.keys(before).filter((name) => name !== 'users')) {
			expect({ rows: after[table], table }).toEqual({ rows: before[table], table });
		}

		expect(after.users).toEqual(before.users.map((row) => ({ ...row, first_household_owner_at: expected[String(row.id)] })));
	});

	it('afterwards the right is exactly: the current owners and the person invited into the application', () => {
		const database = migrateToPrevious();

		applyMigrations(database, connection, './drizzle');

		const allowed = (connection.prepare('SELECT id FROM users ORDER BY id').pluck().all() as string[])
			.filter((id) => hasHouseholdCreationRight(database, id));

		// Not the members, not the people who came with a household invitation (joined or not), not the lone user, and
		// not the people known as former owners only by the invitations they created.
		expect(allowed).toEqual(['anna', 'petr', 'stark', 'tg-1002']);
	});

	it('a former owner known only by invitations, and an owner demoted to member by hand, get no right', () => {
		const database = migrateToPrevious();

		applyMigrations(database, connection, './drizzle');

		for (const id of ['olga', 'vicotya']) {
			expect(connection.prepare('SELECT count(*) FROM household_invitations WHERE created_by_user_id = ?').pluck().get(id), id)
				.toBeGreaterThan(0);
			expect(connection.prepare('SELECT first_household_owner_at FROM users WHERE id = ?').pluck().get(id), id).toBeNull();
			expect(hasHouseholdCreationRight(database, id), id).toBe(false);
		}

		expect(connection.prepare('SELECT role FROM household_members WHERE user_id = ?').pluck().get('vicotya')).toBe('member');
	});

	it('changes nothing else in the schema: one column appended to users, no rebuild, no new object', () => {
		const database = migrateToPrevious();
		const before = readSchemaObjects();

		applyMigrations(database, connection, './drizzle');

		const after = readSchemaObjects();
		const compact = (text: string) => text.replace(/\s+/gu, '');
		const oldUsers = compact(before.find((object) => object.name === 'users')?.sql ?? '');
		const newUsers = compact(after.find((object) => object.name === 'users')?.sql ?? '');

		expect(after.map((object) => object.name)).toEqual(before.map((object) => object.name));
		expect(after.filter((object) => object.name !== 'users')).toEqual(before.filter((object) => object.name !== 'users'));
		expect(newUsers.replace(compact(', `first_household_owner_at` integer'), '')).toBe(oldUsers);
		const columns = (connection.pragma('table_info(users)') as Row[])
			.map((column) => `${column.name} ${String(column.type).toLowerCase()} ${column.notnull}`);

		expect(columns.at(-1))
			.toBe('first_household_owner_at integer 0');
	});

	it('code written before it still inserts users: the new column stays NULL', () => {
		const database = migrateToPrevious();

		applyMigrations(database, connection, './drizzle');
		insertRows('users', [user('after-rollback')]);

		expect(connection.prepare('SELECT first_household_owner_at FROM users WHERE id = ?').pluck().get('after-rollback')).toBeNull();
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
