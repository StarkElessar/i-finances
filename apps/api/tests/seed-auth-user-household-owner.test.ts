import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as schema from '@/infrastructure/database/schema';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `seed-auth-user.ts` writes `users.first_household_owner_at` only for a user who is an owner after the seed
 * (`app-invitations-v1.md`, section 13): a membership that existed before keeps its role, and a member does not get the
 * right to found a household from being seeded. Runs the script itself on a disposable database file.
 */

const T = 1_793_000_000_000;

type UserRow = { first_household_owner_at: number | null; id: string };

let folder: string;
let databasePath: string;

function runSeed(username: string): void {
	execFileSync('./node_modules/.bin/tsx', ['scripts/seed-auth-user.ts'], {
		env: {
			...process.env,
			DATABASE_URL: databasePath,
			NODE_ENV: 'test',
			SEED_DISPLAY_NAME: 'Test',
			SEED_PASSWORD: 'a-long-enough-password',
			SEED_USERNAME: username
		},
		stdio: 'pipe'
	});
}

function withDatabase<TResult>(read: (connection: Database.Database) => TResult): TResult {
	const connection = new Database(databasePath);

	try {
		return read(connection);
	}
	finally {
		connection.close();
	}
}

function userOf(username: string): UserRow | undefined {
	return withDatabase((connection) => connection.prepare('SELECT id, first_household_owner_at FROM users WHERE username = ?')
		.get(username) as UserRow | undefined);
}

function roleOf(userId: string): unknown {
	return withDatabase((connection) => connection.prepare('SELECT household_id, role FROM household_members WHERE user_id = ?')
		.get(userId));
}

beforeEach(() => {
	folder = mkdtempSync(join(tmpdir(), 'if-seed-'));
	databasePath = join(folder, 'seed.sqlite');
	withDatabase((connection) => {
		connection.pragma('foreign_keys = ON');
		migrate(drizzle(connection, { schema }), { migrationsFolder: './drizzle' });
	});
});

afterEach(() => {
	rmSync(folder, { force: true, recursive: true });
});

describe('seed-auth-user.ts and the right to found a household', () => {
	it('a new seeded owner gets the time; a second run keeps it', () => {
		runSeed('stark');

		const stark = userOf('stark');

		expect(roleOf(stark?.id ?? '')).toEqual({ household_id: 'default-household', role: 'owner' });
		expect(stark?.first_household_owner_at).toEqual(expect.any(Number));

		withDatabase((connection) => connection.prepare('UPDATE users SET first_household_owner_at = ? WHERE username = ?')
			.run(T, 'stark'));
		runSeed('stark');

		expect(userOf('stark')?.first_household_owner_at).toBe(T);
	}, 60_000);

	it('a user who is a member of the seed household stays a member and gets no time', () => {
		withDatabase((connection) => {
			connection.prepare(`INSERT INTO users (id, username, display_name, password_hash, is_active, created_at, updated_at)
				VALUES ('vicotya-id', 'vicotya', 'Вика', NULL, 1, ?, ?)`).run(T, T);
			connection.prepare(`INSERT INTO households (id, name, base_currency, created_at, updated_at)
				VALUES ('default-household', 'Семья', 'BYN', ?, ?)`).run(T, T);
			connection.prepare(`INSERT INTO household_members (household_id, user_id, role, joined_at)
				VALUES ('default-household', 'vicotya-id', 'member', ?)`).run(T);
		});

		runSeed('vicotya');

		expect(roleOf('vicotya-id')).toEqual({ household_id: 'default-household', role: 'member' });
		expect(userOf('vicotya')?.first_household_owner_at).toBeNull();
	}, 60_000);
});
