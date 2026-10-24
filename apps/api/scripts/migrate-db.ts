import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import { createDatabaseConnection } from '@/infrastructure/database/create-database-connection';

import { drizzle } from 'drizzle-orm/better-sqlite3';

/**
 * Applies committed Drizzle migrations to the configured SQLite database.
 */
function migrateDatabase(): void {
	const sqlite = createDatabaseConnection({ fileMustExist: false });
	const db = drizzle(sqlite);

	applyMigrations(db, sqlite, './drizzle');
	sqlite.close();
	console.warn('Database migrations applied.');
}

try {
	migrateDatabase();
}
catch (error: unknown) {
	console.error('Failed to apply database migrations.', error);
	process.exitCode = 1;
}
