import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { db, sqlite } from '../src/server/db/client';

/**
 * Applies committed Drizzle migrations to the configured SQLite database.
 */
function migrateDatabase(): void {
    migrate(db, { migrationsFolder: './drizzle' });
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
