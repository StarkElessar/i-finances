import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	sessions,
	telegramAccounts,
	telegramLoginRequests,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';
import {
	EXIT_FAILED,
	EXIT_OK,
	EXIT_USAGE,
	type ResetUserTelegramTerminal,
	runResetUserTelegram,
	UserTelegramReset
} from '@/modules/telegram-auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `reset-user-telegram` (Р10): dry run by default, `--apply` after the typed username, only the target user's link.
 */

const NOW = new Date('2026-10-19T09:00:00.000Z');
const LATER = new Date('2026-10-19T12:00:00.000Z');
/** A well-formed Argon2 hash (the value only has to look like one for `hasUsablePassword`). */
const PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
/** Values that must never reach the terminal. */
const SECRET_CHAT_ID = '55512345678';
const SECRET_SECRET_HASH = 'secret-hash-value-that-must-stay-private';

let connection: Database.Database;
let database: AppDatabase;
let reset: UserTelegramReset;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	reset = new UserTelegramReset(database);

	await database.insert(users).values([
		user('anna', PASSWORD_HASH),
		user('olga', PASSWORD_HASH),
		user('boris', PASSWORD_HASH),
		user('tg-3003', null)
	]);
	await database.insert(telegramAccounts).values([
		account('anna', '1001', 'anna_k'),
		account('olga', '2002', 'olga_v'),
		account('tg-3003', '3003', null)
	]);
	await database.insert(sessions).values([
		session('anna-1', 'anna'),
		session('anna-2', 'anna'),
		session('olga-1', 'olga'),
		session('boris-1', 'boris')
	]);
	await database.insert(telegramLoginRequests).values([
		request('anna-link', { linkUserId: 'anna', purpose: 'link', status: 'pending' }),
		request('anna-confirmed-sign-in', { purpose: 'sign-in', status: 'confirmed', telegramId: '1001' }),
		request('anna-used-sign-in', { purpose: 'sign-in', status: 'used', telegramId: '1001' }),
		request('olga-link', { linkUserId: 'olga', purpose: 'link', status: 'pending' }),
		request('olga-confirmed-sign-in', { purpose: 'sign-in', status: 'confirmed', telegramId: '2002' }),
		request('stranger-pending', { purpose: 'sign-in', status: 'pending' })
	]);
});

afterEach(() => {
	connection.close();
});

function user(id: string, passwordHash: string | null) {
	return { createdAt: NOW, displayName: id, id, isActive: true, passwordHash, updatedAt: NOW, username: id };
}

function account(userId: string, telegramId: string, username: string | null) {
	return {
		chatId: SECRET_CHAT_ID,
		firstName: userId,
		lastSignInAt: NOW,
		linkedAt: NOW,
		telegramId,
		updatedAt: NOW,
		userId,
		username
	};
}

function session(id: string, userId: string) {
	return { createdAt: NOW, expiresAt: LATER, id, lastSeenAt: NOW, tokenHash: `hash-${id}`, userId };
}

function request(
	id: string,
	fields: { linkUserId?: string; purpose: 'link' | 'sign-in'; status: 'confirmed' | 'pending' | 'used'; telegramId?: string }
) {
	return { code: `code-${id}`, createdAt: NOW, expiresAt: LATER, id, secretHash: SECRET_SECRET_HASH, ...fields };
}

type Transcript = { errors: string[]; lines: string[]; questions: string[] };

function terminal(answers: Array<string | undefined>): { terminal: ResetUserTelegramTerminal; transcript: Transcript } {
	const transcript: Transcript = { errors: [], lines: [], questions: [] };
	const remaining = [...answers];

	return {
		terminal: {
			ask: async (question) => {
				transcript.questions.push(question);

				return remaining.shift();
			},
			print: (line) => {
				transcript.lines.push(line);
			},
			printError: (line) => {
				transcript.errors.push(line);
			}
		},
		transcript
	};
}

async function run(argv: string[], answers: Array<string | undefined> = []) {
	const { terminal: io, transcript } = terminal(answers);
	const exitCode = await runResetUserTelegram({ argv, reset, terminal: io });

	return { exitCode, transcript };
}

function everything(transcript: Transcript): string {
	return [...transcript.lines, ...transcript.errors, ...transcript.questions].join('\n');
}

function telegramIds(): string[] {
	return database.select({ id: telegramAccounts.telegramId }).from(telegramAccounts).all().map((row) => row.id).sort();
}

function sessionIds(): string[] {
	return database.select({ id: sessions.id }).from(sessions).all().map((row) => row.id).sort();
}

function requestStatuses(): Record<string, string> {
	return Object.fromEntries(
		database.select({ id: telegramLoginRequests.id, status: telegramLoginRequests.status }).from(telegramLoginRequests).all()
			.map((row) => [row.id, row.status])
	);
}

function snapshot(): string {
	return JSON.stringify({
		accounts: database.select().from(telegramAccounts).all(),
		requests: database.select().from(telegramLoginRequests).all(),
		sessions: database.select().from(sessions).all(),
		users: database.select().from(users).all()
	});
}

describe('dry run', () => {
	it('is the default: it describes the reset and changes nothing', async () => {
		const before = snapshot();
		const { exitCode, transcript } = await run(['anna', '--end-sessions']);

		expect(exitCode).toBe(EXIT_OK);
		expect(snapshot()).toBe(before);
		expect(transcript.questions).toEqual([]);

		const output = everything(transcript);

		expect(output).toContain('Dry run: nothing was changed');
		expect(output).toContain('@anna_k');
		expect(output).toContain('revoke 2 open Telegram login request(s)');
		expect(output).toContain('end all 2 session(s)');
	});

	it('does not prompt and does not apply when --apply is missing, whatever the other flags say', async () => {
		const before = snapshot();
		const { exitCode } = await run(['anna', '--end-sessions', '--allow-lockout'], ['anna']);

		expect(exitCode).toBe(EXIT_OK);
		expect(snapshot()).toBe(before);
	});
});

describe('--apply', () => {
	it('removes only the link of the named user and revokes only the requests that could still hand it out', async () => {
		const { exitCode, transcript } = await run(['anna', '--apply'], ['anna']);

		expect(exitCode).toBe(EXIT_OK);
		expect(telegramIds()).toEqual(['2002', '3003']);
		expect(requestStatuses()).toEqual({
			'anna-confirmed-sign-in': 'rejected',
			'anna-link': 'rejected',
			'anna-used-sign-in': 'used',
			'olga-confirmed-sign-in': 'confirmed',
			'olga-link': 'pending',
			'stranger-pending': 'pending'
		});
		expect(everything(transcript)).toContain('2 login request(s) revoked, 0 session(s) ended');
	});

	it('keeps the user, the password, the passkeys, the sessions and the data', async () => {
		await database.insert(webauthnCredentials).values({
			createdAt: NOW, deviceType: 'singleDevice', id: 'key-1', publicKey: 'pk', userId: 'anna'
		});

		await run(['anna', '--apply'], ['anna']);

		const anna = database.select().from(users).where(eq(users.username, 'anna')).get();

		expect(anna?.passwordHash).toBe(PASSWORD_HASH);
		expect(database.select().from(users).all()).toHaveLength(4);
		expect(database.select().from(webauthnCredentials).all()).toHaveLength(1);
		expect(sessionIds()).toEqual(['anna-1', 'anna-2', 'boris-1', 'olga-1']);
	});

	it('ends only the target user\'s sessions with --end-sessions', async () => {
		const { exitCode, transcript } = await run(['anna', '--apply', '--end-sessions'], ['anna']);

		expect(exitCode).toBe(EXIT_OK);
		expect(sessionIds()).toEqual(['boris-1', 'olga-1']);
		expect(everything(transcript)).toContain('2 session(s) ended');
	});

	it('finds the user by a differently cased username and accepts the confirmation in any case', async () => {
		const { exitCode } = await run(['  ANNA ', '--apply'], [' Anna ']);

		expect(exitCode).toBe(EXIT_OK);
		expect(telegramIds()).toEqual(['2002', '3003']);
	});

	it('changes nothing when the typed username does not match', async () => {
		const before = snapshot();
		const { exitCode, transcript } = await run(['anna', '--apply', '--end-sessions'], ['olga']);

		expect(exitCode).toBe(EXIT_FAILED);
		expect(snapshot()).toBe(before);
		expect(transcript.errors.join('\n')).toContain('Nothing was changed');
	});

	it('changes nothing when the input ends or the answer is empty', async () => {
		const before = snapshot();

		expect((await run(['anna', '--apply'], [undefined])).exitCode).toBe(EXIT_FAILED);
		expect((await run(['anna', '--apply'], [''])).exitCode).toBe(EXIT_FAILED);
		expect(snapshot()).toBe(before);
	});

	it('asks for the username of the user it found, not for the text it was given', async () => {
		const { transcript } = await run(['ANNA', '--apply'], ['anna']);

		expect(transcript.questions).toEqual(['Type the username "anna" to confirm: ']);
	});

	it('never prints the chat id, a secret hash or a password hash', async () => {
		const dry = await run(['anna', '--end-sessions']);
		const applied = await run(['olga', '--apply'], ['olga']);

		for (const output of [everything(dry.transcript), everything(applied.transcript)]) {
			expect(output).not.toContain(SECRET_CHAT_ID);
			expect(output).not.toContain(SECRET_SECRET_HASH);
			expect(output).not.toContain(PASSWORD_HASH);
			expect(output).not.toContain('hash-anna');
		}
	});

	it('prints names from the database without terminal escape sequences, line breaks or direction characters', async () => {
		database.update(users).set({ displayName: 'Анна\u001B[2J\u001B]0;title\u0007‮\nX' }).where(eq(users.id, 'anna')).run();
		database.update(telegramAccounts).set({ firstName: 'A\u001B[31m', username: 'anna\u001B[1A' })
			.where(eq(telegramAccounts.userId, 'anna')).run();

		const { transcript } = await run(['anna']);

		for (const line of [...transcript.lines, ...transcript.errors, ...transcript.questions]) {
			expect(line).not.toMatch(/[\p{Cc}\p{Cf}]/u);
		}
		expect(transcript.lines).toContain('User: anna (Анна [2J ]0;title X), active');
		expect(transcript.lines.some((line) => line.startsWith('Telegram: A [31m (@anna [1A, id 1001)'))).toBe(true);
	});
});

describe('a user who cannot be reset', () => {
	it('without a Telegram link gets a clear message and nothing is touched, even with --apply', async () => {
		const before = snapshot();
		const { exitCode, transcript } = await run(['boris', '--apply', '--end-sessions'], ['boris']);

		expect(exitCode).toBe(EXIT_OK);
		expect(transcript.lines.join('\n')).toContain('No Telegram is linked to this user. Nothing to do.');
		expect(transcript.questions).toEqual([]);
		expect(snapshot()).toBe(before);
	});

	it('that does not exist is an error', async () => {
		const before = snapshot();
		const { exitCode, transcript } = await run(['nobody', '--apply'], ['nobody']);

		expect(exitCode).toBe(EXIT_FAILED);
		expect(transcript.errors).toEqual(['No user with the username "nobody".']);
		expect(snapshot()).toBe(before);
	});

	it('with neither a password nor a passkey is refused unless --allow-lockout is given', async () => {
		const before = snapshot();
		const refused = await run(['tg-3003', '--apply'], ['tg-3003']);

		expect(refused.exitCode).toBe(EXIT_FAILED);
		expect(refused.transcript.questions).toEqual([]);
		expect(everything(refused.transcript)).toContain('no way to sign in');
		expect(snapshot()).toBe(before);

		const dry = await run(['tg-3003']);

		expect(dry.exitCode).toBe(EXIT_OK);
		expect(dry.transcript.lines.join('\n')).toContain('WARNING');
		expect(snapshot()).toBe(before);

		const allowed = await run(['tg-3003', '--apply', '--allow-lockout'], ['tg-3003']);

		expect(allowed.exitCode).toBe(EXIT_OK);
		expect(telegramIds()).toEqual(['1001', '2002']);
	});

	it('with a passkey but no password can be reset without the override', async () => {
		await database.update(users).set({ passwordHash: null }).where(eq(users.id, 'anna'));
		await database.insert(webauthnCredentials).values({
			createdAt: NOW, deviceType: 'singleDevice', id: 'key-1', publicKey: 'pk', userId: 'anna'
		});

		const { exitCode } = await run(['anna', '--apply'], ['anna']);

		expect(exitCode).toBe(EXIT_OK);
		expect(telegramIds()).toEqual(['2002', '3003']);
	});
});

describe('command line', () => {
	it.each([
		[[], 'The username is required'],
		[['--apply'], 'The username is required'],
		[['anna', 'olga'], 'Exactly one username'],
		[['anna', '--aply'], 'Unknown option --aply'],
		[['anna', '--force'], 'Unknown option --force']
	])('%j is a usage error and changes nothing', async (argv, message) => {
		const before = snapshot();
		const { exitCode, transcript } = await run(argv, ['anna']);

		expect(exitCode).toBe(EXIT_USAGE);
		expect(transcript.errors.join('\n')).toContain(message);
		expect(snapshot()).toBe(before);
	});

	it('skips a bare -- inserted by a package runner', async () => {
		expect((await run(['--', 'anna'])).exitCode).toBe(EXIT_OK);
	});
});

describe('UserTelegramReset.apply', () => {
	it('leaves everything alone when the link is no longer the one from the plan', () => {
		const before = snapshot();
		const result = reset.apply({ endSessions: true, expectedTelegramId: '9999', userId: 'anna' });

		expect(result).toEqual({ accountRemoved: false, requestsRevoked: 0, sessionsEnded: 0 });
		expect(snapshot()).toBe(before);
	});

	it('does not remove a link by the Telegram id alone when the user id is another', () => {
		const result = reset.apply({ endSessions: false, expectedTelegramId: '1001', userId: 'olga' });

		expect(result.accountRemoved).toBe(false);
		expect(telegramIds()).toEqual(['1001', '2002', '3003']);
	});

	it('is one transaction: when ending the sessions fails, the link and the requests stay', () => {
		const before = snapshot();

		connection.exec('CREATE TRIGGER fail_session_delete BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT, \'boom\'); END;');

		expect(() => reset.apply({ endSessions: true, expectedTelegramId: '1001', userId: 'anna' })).toThrow();
		expect(snapshot()).toBe(before);
	});

	it('plan() reads only', () => {
		const before = snapshot();
		const plan = reset.plan('anna');

		expect(plan).toMatchObject({
			hasPassword: true,
			openLoginRequestCount: 2,
			passkeyCount: 0,
			sessionCount: 2,
			telegram: { telegramId: '1001', username: 'anna_k' },
			userId: 'anna'
		});
		expect(snapshot()).toBe(before);
	});
});
