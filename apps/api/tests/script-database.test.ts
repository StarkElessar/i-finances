import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import { createDatabaseConnection } from '@/infrastructure/database/create-database-connection';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MAINTENANCE_SCRIPTS = [
	'reset-user-telegram',
	'seed-auth-user',
	'cleanup-receipt-images',
	'upsert-exchange-rate'
];

let directory: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'i-finances-script-database-'));
});

afterEach(() => {
	vi.unstubAllEnvs();
	rmSync(directory, { force: true, recursive: true });
});

function runScript(script: string, databaseUrl: string, args: string[] = []) {
	return spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}.ts`, ...args], {
		encoding: 'utf8',
		env: {
			...process.env,
			AUTH_ORIGIN: 'https://finances.example.test',
			DATABASE_URL: databaseUrl,
			DEV_TELEGRAM_LOGIN: 'false',
			NODE_ENV: 'production',
			PLATFORM_ADMIN_USERNAMES: '',
			RECEIPT_IMAGE_ROOT: join(directory, 'images'),
			SEED_DISPLAY_NAME: 'Database test',
			SEED_PASSWORD: 'a-long-enough-test-password',
			SEED_USERNAME: 'database-test',
			TELEGRAM_BOT_TOKEN: '',
			TELEGRAM_BOT_USERNAME: '',
			TELEGRAM_LOGIN_TTL_MINUTES: '',
			TELEGRAM_REGISTRATION_ENABLED: 'false',
			TELEGRAM_UPDATES: 'off',
			TRUSTED_PROXY_COUNT: '0'
		},
		input: '',
		timeout: 30_000
	});
}

describe.each(MAINTENANCE_SCRIPTS)('%s database opening', (script) => {
	it('refuses a missing database without creating a file', () => {
		const databasePath = join(directory, 'missing.sqlite');
		const result = runScript(script, databasePath);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(`база не найдена: ${databasePath}`);
		expect(result.stderr).not.toContain('no such table');
		expect(readdirSync(directory)).toEqual([]);
	});

	it('resolves a relative file: URL without creating a missing parent directory', () => {
		const databasePath = join(directory, 'missing', 'database.sqlite');
		const result = runScript(script, `file:${relative(process.cwd(), databasePath)}`);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(`база не найдена: ${databasePath}`);
		expect(existsSync(databasePath)).toBe(false);
		expect(readdirSync(directory)).toEqual([]);
	});
});

describe('database creation and existing databases', () => {
	it('lets migrations create a database and all maintenance scripts use it', () => {
		const databasePath = join(directory, 'new', 'database.sqlite');
		const migration = runScript('migrate-db', databasePath);

		expect(migration.error).toBeUndefined();
		expect(migration.status, migration.stderr).toBe(0);
		expect(migration.stderr).toContain('Database migrations applied.');
		expect(existsSync(databasePath)).toBe(true);

		const seed = runScript('seed-auth-user', databasePath);
		const reset = runScript('reset-user-telegram', databasePath, ['database-test']);
		const rate = runScript('upsert-exchange-rate', `file:${databasePath}`, [
			'--date', '2026-10-23', '--from', 'USD', '--to', 'BYN', '--rate', '3.25'
		]);
		const cleanup = runScript('cleanup-receipt-images', databasePath);
		const repeatedMigration = runScript('migrate-db', databasePath);

		for (const result of [seed, reset, rate, cleanup, repeatedMigration]) {
			expect(result.error).toBeUndefined();
			expect(result.status, result.stderr).toBe(0);
		}

		expect(reset.stderr).toContain('No Telegram is linked to this user. Nothing to do.');
		expect(cleanup.stderr).toContain('Deleted 0 receipt image(s) past retention.');

		vi.stubEnv('DATABASE_URL', databasePath);
		const connection = createDatabaseConnection({ fileMustExist: true });

		try {
			expect(connection.prepare('SELECT username FROM users').all()).toEqual([{ username: 'database-test' }]);
			expect(connection.prepare('SELECT rate FROM exchange_rates').all()).toEqual([{ rate: '3.25' }]);
			expect(connection.pragma('journal_mode', { simple: true })).toBe('wal');
			expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
			expect(connection.pragma('busy_timeout', { simple: true })).toBe(5000);
			expect(connection.pragma('foreign_key_check')).toEqual([]);
		}
		finally {
			connection.close();
		}
	}, 30_000);

	it('preserves the original error for an existing file that is not a database', () => {
		const databasePath = join(directory, 'invalid.sqlite');

		writeFileSync(databasePath, 'This is not a SQLite database.');
		const result = runScript('reset-user-telegram', databasePath, ['database-test']);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('file is not a database');
		expect(result.stderr).not.toContain('база не найдена');
	});

	it('opens :memory: with fileMustExist and keeps the connection settings', () => {
		vi.stubEnv('DATABASE_URL', ':memory:');
		const connection = createDatabaseConnection({ fileMustExist: true });

		try {
			applyMigrations(drizzle(connection), connection, './drizzle');

			expect(connection.prepare('SELECT username FROM users').all()).toEqual([]);
			expect(connection.pragma('journal_mode', { simple: true })).toBe('memory');
			expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
			expect(connection.pragma('busy_timeout', { simple: true })).toBe(5000);
			expect(readdirSync(directory)).toEqual([]);
		}
		finally {
			connection.close();
		}
	});

	it('still runs the migration script against :memory:', () => {
		const result = runScript('migrate-db', ':memory:');

		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr).toContain('Database migrations applied.');
		expect(readdirSync(directory)).toEqual([]);
	});
});
