import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Journal = { entries: { tag: string }[] };

/**
 * Copies `./drizzle` to a temporary folder whose journal stops right before `tag`.
 *
 * Everything from `tag` on is cut, not only `tag` itself: the Drizzle migrator applies a
 * migration only when it is newer than the last applied one, so leaving a later
 * migration in the journal would make it skip `tag` on the real run. The caller removes
 * the folder.
 */
export function copyMigrationsBefore(tag: string): string {
	const folder = mkdtempSync(join(tmpdir(), 'if-migrations-'));

	cpSync('./drizzle', folder, { recursive: true });

	const journalPath = join(folder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
	const index = journal.entries.findIndex((entry) => entry.tag === tag);

	if (index === -1) {
		throw new Error(`Migration ${tag} is not in the journal.`);
	}

	journal.entries = journal.entries.slice(0, index);
	writeFileSync(journalPath, JSON.stringify(journal));

	return folder;
}
