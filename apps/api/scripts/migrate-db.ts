import { applyMigrations } from '@/infrastructure/database/apply-migrations';
import { db, sqlite } from '@/infrastructure/database/client';

/**
 * Applies committed Drizzle migrations to the configured SQLite database.
 */
function migrateDatabase(): void {
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
