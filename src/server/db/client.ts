import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

/**
 * Global development cache preventing duplicate SQLite handles during HMR.
 */
type DatabaseGlobal = typeof globalThis & {
    iFinancesSqlite?: Database.Database;
};

/**
 * Resolves the configured SQLite URL to a local filesystem path.
 */
function resolveDatabasePath(): string {
    const configuredPath = process.env.DATABASE_URL ?? './data/i-finances.sqlite';
    const path = configuredPath.startsWith('file:') ? configuredPath.slice('file:'.length) : configuredPath;

    return path === ':memory:' ? path : resolve(path);
}

/**
 * Opens and configures the shared SQLite connection.
 */
function createDatabaseConnection(): Database.Database {
    const databasePath = resolveDatabasePath();

    if (databasePath !== ':memory:') {
        mkdirSync(dirname(databasePath), { recursive: true });
    }

    const connection = new Database(databasePath);
    connection.pragma('journal_mode = WAL');
    connection.pragma('foreign_keys = ON');
    connection.pragma('busy_timeout = 5000');

    return connection;
}

const databaseGlobal = globalThis as DatabaseGlobal;

/**
 * Low-level SQLite handle used by migration and maintenance scripts.
 */
export const sqlite = databaseGlobal.iFinancesSqlite ?? createDatabaseConnection();

if (process.env.NODE_ENV !== 'production') {
    databaseGlobal.iFinancesSqlite = sqlite;
}

/**
 * Typed Drizzle client shared by server-only repositories.
 */
export const db = drizzle(sqlite, { schema });
