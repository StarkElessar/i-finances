import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { createDatabaseConnection } from './create-database-connection';
import * as schema from './schema';

/**
 * Global development cache preventing duplicate SQLite handles during HMR.
 */
type DatabaseGlobal = typeof globalThis & {
	iFinancesSqlite?: Database.Database;
};

const databaseGlobal = globalThis as DatabaseGlobal;

/**
 * Shared SQLite handle for the API and maintenance scripts. Migrations create the database separately.
 */
export const sqlite = databaseGlobal.iFinancesSqlite ?? createDatabaseConnection({ fileMustExist: true });

if (process.env.NODE_ENV !== 'production') {
	databaseGlobal.iFinancesSqlite = sqlite;
}

/**
 * Typed Drizzle client shared by server-only repositories.
 */
export const db = drizzle(sqlite, { schema });

/**
 * Shared Drizzle database shape accepted by repositories and test databases.
 */
export type AppDatabase = typeof db;

/**
 * The handle every statement of one `database.transaction(...)` callback runs on. Repositories that must change rows
 * of another repository's table inside their own transaction pass it on (for example the member removal of Р7 ends the
 * removed user's sessions through `SessionRepository.deleteByUserId`).
 */
export type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
