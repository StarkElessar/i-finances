import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Applies Drizzle migrations with foreign keys suspended.
 *
 * SQLite cannot drop a constraint in place, so Drizzle rebuilds the table
 * (create new, copy, drop old, rename). The migrator wraps everything in a
 * transaction where `PRAGMA foreign_keys` is a no-op, so the pragma has to be
 * switched off here, before the transaction starts.
 */
export function applyMigrations(
	database: BetterSQLite3Database<Record<string, unknown>>,
	sqlite: Database.Database,
	migrationsFolder: string
): void {
	sqlite.pragma('foreign_keys = OFF');

	try {
		migrate(database, { migrationsFolder });

		const violations = sqlite.pragma('foreign_key_check');

		if (Array.isArray(violations) && violations.length > 0) {
			throw new Error(
				`Migrations left ${violations.length} foreign key violation(s).`
			);
		}
	}
	finally {
		sqlite.pragma('foreign_keys = ON');
	}
}
