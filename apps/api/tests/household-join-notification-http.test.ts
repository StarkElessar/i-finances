import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { telegramAccounts } from '@/infrastructure/database/schema';
import { HouseholdInvitationService } from '@/modules/household';
import { TelegramForbiddenError, TelegramNetworkError } from '@/modules/telegram';

import { createHouseholdInvitationResultSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';
import {
	createHouseholdTestApp,
	DEFAULT_INVITATION_TTL,
	insertHousehold,
	insertUser,
	TEST_ORIGIN
} from './support/household-test-app';

/**
 * A9: when an invitation is accepted, the inviter hears about it through the bot (Р5, A9). The notice goes out after
 * the acceptance is committed and in the background (the answer to the guest does not wait for Telegram); a failure of
 * the send, or a missing or blocked Telegram, never changes the acceptance.
 */

const OWNER = 'owner';

const MEMBER = 'member';

const NEWCOMER = 'newcomer';

const FAMILY = 'family-household';

/** The private chat of the owner with the bot (`telegram_accounts.chat_id`). */
const OWNER_CHAT = '777000111';

const TOKEN_LINK = new RegExp(`^${TEST_ORIGIN}/invite#([A-Za-z0-9_-]{43})$`, 'u');

function joinedText(name: string, household: string): string {
	return `${name} теперь в окружении «${household}». Если вы не приглашали этого человека, удалите его в разделе «Окружение».`;
}

let connection: Database.Database;

let database: AppDatabase;

let bot: FakeTelegramBotClient;

let harness: ReturnType<typeof createHouseholdTestApp>;

const tokens: Record<string, string> = {};

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await insertUser(database, OWNER, 'Сергей');
	await insertUser(database, MEMBER, 'Анна');
	await insertUser(database, NEWCOMER, 'Олег');
	await insertHousehold(database, FAMILY, 'Семья', [{ role: 'owner', userId: OWNER }, { role: 'member', userId: MEMBER }]);

	const at = new Date('2026-10-01T10:00:00.000Z');

	await database.insert(telegramAccounts).values({
		chatId: OWNER_CHAT,
		firstName: 'Сергей',
		linkedAt: at,
		lastSignInAt: at,
		telegramId: '5001',
		updatedAt: at,
		userId: OWNER,
		username: 'sergey'
	});

	bot = new FakeTelegramBotClient();
	harness = createHouseholdTestApp(database, DEFAULT_INVITATION_TTL, { botClient: bot });

	for (const userId of [OWNER, MEMBER, NEWCOMER]) {
		tokens[userId] = await harness.signIn(userId);
	}
});

afterEach(() => {
	connection.close();
	vi.restoreAllMocks();
});

async function createInvitation(): Promise<{ id: string; token: string }> {
	const response = await harness.call('/api/household/invitations', { method: 'POST', token: tokens[OWNER] });
	const body = createHouseholdInvitationResultSchema.parse(await response.json());

	if (!body.ok) {
		throw new Error('invitation not created');
	}

	const token = TOKEN_LINK.exec(body.invitation.link)?.[1];

	expect(token, body.invitation.link).toBeDefined();

	return { id: body.invitation.id, token: token as string };
}

/** Accepts and waits for the background notice, so that what the bot was asked to send is final. */
async function accept(token: string, userId = NEWCOMER): Promise<Response> {
	const response = await harness.call('/api/invitations/accept', { body: { token }, token: tokens[userId] });

	await harness.notificationsSettled();

	return response;
}

async function linkTelegram(userId: string, telegramId: string, chatId: string): Promise<void> {
	const at = new Date('2026-10-01T10:00:00.000Z');

	await database.insert(telegramAccounts).values({
		chatId,
		firstName: userId,
		linkedAt: at,
		lastSignInAt: at,
		telegramId,
		updatedAt: at,
		userId,
		username: null
	});
}

function sentMessages() {
	return bot.callsTo('sendMessage').map((call) => call.input);
}

function membershipOf(userId: string) {
	return connection.prepare('SELECT household_id, role FROM household_members WHERE user_id = ?').get(userId);
}

function invitationRow(id: string) {
	return connection.prepare('SELECT accepted_at, accepted_by_user_id FROM household_invitations WHERE id = ?').get(id) as {
		accepted_at: number | null;
		accepted_by_user_id: string | null;
	};
}

function botBlockedAtOf(userId: string): number | null {
	const row = connection.prepare('SELECT bot_blocked_at FROM telegram_accounts WHERE user_id = ?').get(userId) as {
		bot_blocked_at: number | null;
	};

	return row.bot_blocked_at;
}

describe('the inviter is told through the bot', () => {
	it('an accepted invitation sends the owner the new member name and the household name', async () => {
		const { token } = await createInvitation();
		const response = await accept(token);

		expect(response.status).toBe(200);
		expect(sentMessages()).toEqual([{ chatId: OWNER_CHAT, text: joinedText('Олег', 'Семья') }]);
	});

	it('names are cleaned of control and bidi characters and placed as plain text', async () => {
		await insertUser(database, 'weird', 'Ол‮eг\n{household} $&');
		connection.prepare('UPDATE households SET name = ? WHERE id = ?').run('Семья‮\n  X', FAMILY);
		tokens.weird = await harness.signIn('weird');
		const { token } = await createInvitation();

		const response = await accept(token, 'weird');

		expect(response.status).toBe(200);
		expect(sentMessages()).toEqual([{ chatId: OWNER_CHAT, text: joinedText('Ол eг {household} $&', 'Семья X') }]);
	});

	it('nothing is sent when the inviter has no linked Telegram, and the acceptance stands', async () => {
		connection.prepare('DELETE FROM telegram_accounts WHERE user_id = ?').run(OWNER);
		const { token } = await createInvitation();

		const response = await accept(token);

		expect(response.status).toBe(200);
		expect(sentMessages()).toEqual([]);
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
	});

	it('a refused acceptance (used link) sends nothing', async () => {
		const { token } = await createInvitation();

		expect((await accept(token)).status).toBe(200);
		expect((await accept(token, MEMBER)).status).toBe(404);
		expect(sentMessages()).toHaveLength(1);
	});

	it('the notice is sent after the commit: the new membership and the accepted invitation are already there', async () => {
		const { id, token } = await createInvitation();
		const original = bot.sendMessage.bind(bot);
		let membershipAtSend: unknown;
		let acceptedAtSend: unknown;

		vi.spyOn(bot, 'sendMessage').mockImplementation(async (input) => {
			membershipAtSend = membershipOf(NEWCOMER);
			acceptedAtSend = invitationRow(id).accepted_by_user_id;

			return original(input);
		});

		expect((await accept(token)).status).toBe(200);
		expect(membershipAtSend).toEqual({ household_id: FAMILY, role: 'member' });
		expect(acceptedAtSend).toBe(NEWCOMER);
	});

	it('the answer to the guest does not wait for Telegram (the notice is sent in the background)', async () => {
		const { token } = await createInvitation();
		let finishSend: () => void = () => undefined;
		const sendStarted = vi.fn();

		vi.spyOn(bot, 'sendMessage').mockImplementation(() => {
			sendStarted();

			return new Promise((resolve) => {
				finishSend = () => resolve({ messageId: 1 });
			});
		});

		const response = await harness.call('/api/invitations/accept', { body: { token }, token: tokens[NEWCOMER] });

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ household: { id: FAMILY, role: 'member' }, ok: true });
		await vi.waitFor(() => {
			expect(sendStarted).toHaveBeenCalledOnce();
		});
		finishSend();
		await harness.notificationsSettled();
	});

	it('names are cut to their limits: 100 characters for the member, 120 for the household', async () => {
		await insertUser(database, 'long', 'Я'.repeat(150));
		connection.prepare('UPDATE households SET name = ? WHERE id = ?').run('С'.repeat(130), FAMILY);
		tokens.long = await harness.signIn('long');
		const { token } = await createInvitation();

		expect((await accept(token, 'long')).status).toBe(200);
		expect(sentMessages()).toEqual([{ chatId: OWNER_CHAT, text: joinedText('Я'.repeat(100), 'С'.repeat(120)) }]);
	});

	it('nothing is looked up, sent or logged while no bot token is configured', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		harness = createHouseholdTestApp(database, DEFAULT_INVITATION_TTL, { botClient: null });
		for (const userId of [OWNER, NEWCOMER]) {
			tokens[userId] = await harness.signIn(userId);
		}
		const { token } = await createInvitation();

		expect((await accept(token)).status).toBe(200);
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).not.toHaveBeenCalled();
	});
});

describe('a 403 from Telegram marks the owner as blocked the bot', () => {
	it('records bot_blocked_at and the acceptance stands', async () => {
		bot.failNext('sendMessage', new TelegramForbiddenError('sendMessage', 'Forbidden: bot was blocked by the user'));
		const { token } = await createInvitation();

		const response = await accept(token);

		expect(response.status).toBe(200);
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(botBlockedAtOf(OWNER)).toBe(harness.clock.now.getTime());
	});

	it('marks only the owner: another linked Telegram keeps bot_blocked_at empty', async () => {
		await linkTelegram(MEMBER, '5002', '777000222');
		bot.failNext('sendMessage', new TelegramForbiddenError('sendMessage', 'Forbidden: bot was blocked by the user'));
		const { token } = await createInvitation();

		expect((await accept(token)).status).toBe(200);
		expect(botBlockedAtOf(OWNER)).toBe(harness.clock.now.getTime());
		expect(botBlockedAtOf(MEMBER)).toBeNull();
	});

	it('a successful send changes nothing: bot_blocked_at keeps its earlier value', async () => {
		connection.prepare('UPDATE telegram_accounts SET bot_blocked_at = 1000 WHERE user_id = ?').run(OWNER);
		const { token } = await createInvitation();

		expect((await accept(token)).status).toBe(200);
		expect(sentMessages()).toHaveLength(1);
		expect(botBlockedAtOf(OWNER)).toBe(1000);
	});
});

describe('a failed send never fails the acceptance', () => {
	it.each([
		['a Telegram network error', () => new TelegramNetworkError('sendMessage')],
		['an unexpected error', () => new Error('database is locked')]
	])('%s: the owner is not told, the member joins, nothing is marked', async (_label, makeError) => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		bot.failNext('sendMessage', makeError());
		const { id, token } = await createInvitation();

		const response = await accept(token);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ household: { id: FAMILY, role: 'member' }, ok: true });
		expect(membershipOf(NEWCOMER)).toEqual({ household_id: FAMILY, role: 'member' });
		expect(invitationRow(id).accepted_by_user_id).toBe(NEWCOMER);
		expect(botBlockedAtOf(OWNER)).toBeNull();
		// The log names the error class only: no token, no text of the message.
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('теперь в окружении');
	});

	it('a notifier that rejects does not fail the service call (the service guards its own call)', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const service = new HouseholdInvitationService({
			acceptRateLimiter: { tryConsume: () => ({ allowed: true }) },
			appInvitations: { findPreview: async () => ({ kind: 'unavailable' as const, reason: 'unknown' as const }) },
			config: { ttlMilliseconds: DEFAULT_INVITATION_TTL },
			householdResolver: { requireForUser: async () => ({ baseCurrency: 'BYN', id: FAMILY, name: 'Семья', role: 'member' }) },
			invitations: {
				accept: () => ({
					householdId: FAMILY,
					householdName: 'Семья',
					inviterUserId: OWNER,
					kind: 'joined',
					memberDisplayName: 'Олег',
					replacedHouseholdId: null
				}),
				create: () => ({ kind: 'created' }),
				findPreview: async () => ({ kind: 'unavailable' as const, reason: 'unknown' as const }),
				listActive: async () => [],
				revoke: () => true
			},
			memberJoinedNotifier: {
				notifyMemberJoined: async () => {
					throw new Error('notifier exploded');
				}
			},
			origin: TEST_ORIGIN,
			previewRateLimiter: { tryConsume: () => ({ allowed: true }) }
		});

		expect(await service.accept(NEWCOMER, { replaceEmptyHousehold: false, token: 'a'.repeat(43) })).toEqual({
			household: { id: FAMILY, name: 'Семья', role: 'member' },
			ok: true
		});
		await vi.waitFor(() => {
			expect(consoleError).toHaveBeenCalledWith('Household member notification failed.', 'Error');
		});
	});
});
