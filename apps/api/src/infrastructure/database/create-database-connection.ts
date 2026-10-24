import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

/**
 * Resolves the configured SQLite URL to a local filesystem path.
 */
function resolveDatabasePath(): string {
	const configuredPath = process.env.DATABASE_URL ?? './data/i-finances.sqlite';
	const path = configuredPath.startsWith('file:') ? configuredPath.slice('file:'.length) : configuredPath;

	return path === ':memory:' ? path : resolve(path);
}

/**
 * Opens and configures SQLite. Only the migrator may create a missing database and its directory.
 */
export function createDatabaseConnection({ fileMustExist }: { fileMustExist: boolean }): Database.Database {
	const databasePath = resolveDatabasePath();

	if (!fileMustExist && databasePath !== ':memory:') {
		mkdirSync(dirname(databasePath), { recursive: true });
	}

	let connection: Database.Database;

	try {
		connection = new Database(databasePath, { fileMustExist });
	}
	catch (error: unknown) {
		if (fileMustExist && databasePath !== ':memory:' && !existsSync(databasePath)) {
			throw new Error(`база не найдена: ${databasePath}`, { cause: error });
		}

		throw error;
	}

	connection.pragma('journal_mode = WAL');
	connection.pragma('foreign_keys = ON');
	connection.pragma('busy_timeout = 5000');

	return connection;
}
