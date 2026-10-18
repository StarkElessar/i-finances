import type { createApiApp as CreateApiApp } from '@/app';
import type {
	createApiDependencies as CreateApiDependencies,
	toApiAppDependencies as ToApiAppDependencies
} from '@/composition-root';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	householdInvitations,
	householdMembers,
	households,
	sessions,
	telegramAccounts,
	telegramLoginRequests,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';
import { hashSessionToken } from '@/modules/auth';
import type { TelegramUpdate } from '@/modules/telegram';
import { HOUSEHOLD_DATA_REFERENCES, USER_AUTHORSHIP_REFERENCES } from '@/modules/telegram-auth';

import Database from 'better-sqlite3';
import { eq, getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

/**
 * A4: linking Telegram to a signed-in user and merging an empty duplicate (Р9, flow 5.3), over HTTP on the real
 * production graph with a fake bot and a fresh `:memory:` database per test. Bot updates arrive through the webhook.
 */

const ORIGIN = 'http://localhost:5173';
const WEBHOOK_SECRET = 'link-webhook-secret-0123456789abcdef';
const BOT_USERNAME = 'i_finances_test_bot';
const MCP_API_KEY = 'k'.repeat(48);
const TG_COOKIE = 'i_finances_tg_login';
const SESSION_COOKIE = 'i_finances_session';
const CHROME_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
	+ '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/** Any non-NULL hash is «has a password» for the merge rule; the format does not matter here. */
const PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2g';
const ANNA = { first_name: 'Анна', id: 1001, is_bot: false, last_name: 'Каренина', username: 'anna_k' };
const MALLORY = { first_name: 'Mallory', id: 6666, is_bot: false };
const UNKNOWN_CODE = 'nobodyhasthiscode000000000000000';
const AT = new Date('2026-10-01T10:00:00.000Z');

type TelegramUserFixture = typeof ANNA | typeof MALLORY;

let createApp: typeof CreateApiApp;
let createDependencies: typeof CreateApiDependencies;
let toAppDependencies: typeof ToApiAppDependencies;
let connection: Database.Database;
let database: AppDatabase;
let nextUpdateId: number;

type Harness = {
	app: ReturnType<typeof CreateApiApp>;
	bot: FakeTelegramBotClient;
};

beforeAll(async () => {
	vi.stubEnv('DATABASE_URL', ':memory:');
	vi.stubEnv('AUTH_ORIGIN', ORIGIN);
	vi.stubEnv('TRUSTED_PROXY_COUNT', '1');
	// A working MCP key for sergei: the link routes must refuse it although it would authenticate elsewhere.
	vi.stubEnv('MCP_API_KEY', MCP_API_KEY);
	vi.stubEnv('MCP_USER_ID', 'sergei');
	vi.stubGlobal('fetch', async () => {
		throw new Error('Network access is disabled in tests.');
	});
	vi.resetModules();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	({ createApiApp: createApp } = await import('@/app'));
	({ createApiDependencies: createDependencies, toApiAppDependencies: toAppDependencies } = await import('@/composition-root'));
});

afterAll(async () => {
	(await import('@/infrastructure/database/client')).sqlite.close();
	delete (globalThis as { iFinancesSqlite?: unknown }).iFinancesSqlite;
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

beforeEach(async () => {
	nextUpdateId = 1;
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	vi.stubEnv('TELEGRAM_UPDATES', 'webhook');
	vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:link-test-token');
	vi.stubEnv('TELEGRAM_BOT_USERNAME', BOT_USERNAME);
	vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
	// Р9: the rollout links Telegram while registration is still closed.
	vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'false');
	vi.stubEnv('DEV_TELEGRAM_LOGIN', '');
	vi.stubEnv('NODE_ENV', 'test');
	await seedFamily();
});

afterEach(() => {
	connection.close();
});

function boot(): Harness {
	const bot = new FakeTelegramBotClient();

	return { app: createApp(toAppDependencies(createDependencies(database, { telegramBotClient: bot }))), bot };
}

function tokenOf(sessionId: string): string {
	return `${sessionId}-token-0123456789abcdef`;
}

/** The owner «Сергей» (password, household with an account) and the member «Ольга» (password), as on production. */
async function seedFamily(): Promise<void> {
	await database.insert(users).values([['sergei', 'Сергей'], ['olga', 'Ольга']].map(([id, displayName]) => ({
		createdAt: AT,
		displayName,
		id,
		isActive: true,
		passwordHash: PASSWORD_HASH,
		updatedAt: AT,
		username: id
	})));
	await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'family', name: 'Семья', updatedAt: AT });
	await database.insert(householdMembers).values([
		{ householdId: 'family', joinedAt: AT, role: 'owner', userId: 'sergei' },
		{ householdId: 'family', joinedAt: AT, role: 'member', userId: 'olga' }
	]);
	await insertAccount('family-card', 'family', 'sergei');
	await insertSession('sergei-laptop', 'sergei');
	await insertSession('olga-phone', 'olga');
}

async function insertSession(id: string, userId: string): Promise<void> {
	await database.insert(sessions).values({
		createdAt: AT,
		expiresAt: new Date(Date.now() + 86_400_000),
		id,
		lastSeenAt: new Date(),
		tokenHash: hashSessionToken(tokenOf(id)),
		userId
	});
}

async function insertAccount(id: string, householdId: string, createdByUserId: string): Promise<void> {
	await database.insert(accounts).values({
		color: '#3f77a8',
		createdAt: AT,
		createdByUserId,
		currency: 'BYN',
		householdId,
		id,
		initialBalanceMinor: 0,
		name: 'Карта',
		type: 'cash',
		updatedAt: AT
	});
}

/**
 * A user that Telegram created before registration was closed (or after it was opened too early): no password, the
 * Telegram account `telegramId`, a session of its own, optionally its own (empty) household.
 */
async function seedDuplicate(options: { household?: boolean; telegramId?: number } = {}): Promise<void> {
	const telegramId = String(options.telegramId ?? ANNA.id);

	await database.insert(users).values({
		createdAt: AT,
		displayName: 'Анна Каренина',
		id: 'duplicate',
		isActive: true,
		passwordHash: null,
		updatedAt: AT,
		username: `tg-${telegramId}`
	});
	await database.insert(telegramAccounts).values({
		chatId: telegramId,
		firstName: 'Анна',
		lastName: null,
		lastSignInAt: AT,
		linkedAt: AT,
		telegramId,
		updatedAt: AT,
		userId: 'duplicate',
		username: 'old_name'
	});
	await insertSession('duplicate-phone', 'duplicate');

	if (options.household === true) {
		await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'dup-home', name: 'Моё', updatedAt: AT });
		await database.insert(householdMembers).values({ householdId: 'dup-home', joinedAt: AT, role: 'owner', userId: 'duplicate' });
	}
}

/** A browser of a signed-in user: keeps the cookies the server sets and sends them back. */
class Browser {
	public readonly cookies = new Map<string, string>();

	public constructor(
		private readonly harness: Harness,
		sessionId?: string,
		private readonly ipAddress = '198.51.100.7'
	) {
		if (sessionId !== undefined) {
			this.cookies.set(SESSION_COOKIE, tokenOf(sessionId));
		}
	}

	public async post(
		path: string,
		body?: unknown,
		extraHeaders: Record<string, string> = {},
		peerAddress?: string
	): Promise<{ body: unknown; response: Response }> {
		const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		const response = await this.harness.app.request(path, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: {
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...(cookie === '' ? {} : { cookie }),
				origin: ORIGIN,
				'user-agent': CHROME_ON_MAC,
				'x-forwarded-for': `10.0.0.1, ${this.ipAddress}`,
				...extraHeaders
			},
			method: 'POST'
		}, peerAddress === undefined ? undefined : { incoming: { socket: { remoteAddress: peerAddress } } });

		this.adopt(response);

		return { body: await response.json() as unknown, response };
	}

	public async get(path: string): Promise<{ body: unknown; status: number }> {
		const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		const response = await this.harness.app.request(path, { headers: cookie === '' ? {} : { cookie } });

		return { body: await response.json() as unknown, status: response.status };
	}

	public async linkStart(): Promise<string> {
		const { body, response } = await this.post('/api/auth/telegram/link/start');

		expect(response.status, JSON.stringify(body)).toBe(200);

		return (body as { code: string }).code;
	}

	public linkComplete(code: string) {
		return this.post('/api/auth/telegram/link/complete', { code });
	}

	private adopt(response: Response): void {
		for (const header of response.headers.getSetCookie()) {
			const [pair] = header.split(';');
			const separator = pair.indexOf('=');
			const name = pair.slice(0, separator);
			const value = pair.slice(separator + 1);

			if (value === '' || /Max-Age=0/i.test(header)) {
				this.cookies.delete(name);
			}
			else {
				this.cookies.set(name, value);
			}
		}
	}
}

async function deliver(harness: Harness, update: Omit<TelegramUpdate, 'update_id'> & { update_id?: number }): Promise<Response> {
	return harness.app.request('/api/telegram/webhook', {
		body: JSON.stringify({ ...update, update_id: update.update_id ?? nextUpdateId++ }),
		headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
		method: 'POST'
	});
}

function startMessage(from: TelegramUserFixture, text: string, chat: { id: number; type: string } = { id: from.id, type: 'private' }) {
	return { message: { chat, date: 1_760_000_000, from, message_id: 50, text } };
}

function buttonPress(from: TelegramUserFixture, data: string, chatId: number = from.id) {
	return { callback_query: { data, from, id: `cb-${nextUpdateId}`, message: { chat: { id: chatId, type: 'private' }, message_id: 77 } } };
}

function lastButtons(bot: FakeTelegramBotClient): { confirm: string; reject: string } {
	const row = bot.callsTo('sendMessage').at(-1)?.input.keyboard?.[0] ?? [];
	const confirm = row.at(0)?.callbackData;
	const reject = row.at(1)?.callbackData;

	if (confirm === undefined || reject === undefined) {
		throw new Error('The bot sent no confirmation buttons.');
	}

	return { confirm, reject };
}

function lastEditedText(bot: FakeTelegramBotClient): string | undefined {
	return bot.callsTo('editMessageText').at(-1)?.input.text;
}

function requestRow(code: string) {
	return database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, code)).get();
}

/** `/start` in the bot, then «Привязать», as `from`. */
async function confirmLinkInBot(harness: Harness, code: string, from: TelegramUserFixture = ANNA): Promise<void> {
	await deliver(harness, startMessage(from, `/start ${code}`));
	await deliver(harness, buttonPress(from, lastButtons(harness.bot).confirm));
}

/** Everything a link may change, to prove that a refused one changed nothing. */
function snapshot(): Record<string, unknown[]> {
	return Object.fromEntries(['users', 'telegram_accounts', 'sessions', 'households', 'household_members', 'accounts',
		'webauthn_credentials', 'household_invitations'].map((table) => [
		table,
		connection.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
	]));
}

describe('linking Telegram: the whole path (Р9 rollout)', () => {
	it('link/start → /start names the account → «Привязать» → link/complete links and keeps the session', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const sessionToken = sergei.cookies.get(SESSION_COOKIE);
		const { body: startBody, response: startResponse } = await sergei.post('/api/auth/telegram/link/start');
		const { code } = startBody as { code: string };
		const tgCookie = startResponse.headers.getSetCookie().find((header) => header.startsWith(`${TG_COOKIE}=`)) ?? '';

		expect(startResponse.status).toBe(200);
		expect(startBody).toEqual({
			appUrl: `tg://resolve?domain=${BOT_USERNAME}&start=${code}`,
			botUrl: `https://t.me/${BOT_USERNAME}?start=${code}`,
			code,
			expiresAt: expect.any(String),
			ok: true
		});
		expect(tgCookie).toMatch(/HttpOnly/);
		expect(tgCookie).toMatch(/Path=\/api\/auth\/telegram(;|$)/);
		expect(requestRow(code)).toMatchObject({ ipAddress: '198.51.100.7', linkUserId: 'sergei', purpose: 'link', status: 'pending' });
		expect((await sergei.linkComplete(code)).body).toEqual({ ok: true, status: 'pending' });

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const [offer] = harness.bot.callsTo('sendMessage');

		expect(offer.input.chatId).toBe(ANNA.id);
		expect(offer.input.text).toMatch(new RegExp(
			'^Привязать Telegram-аккаунт к i-finances\\? \\(аккаунт «Сергей»\\)\\nЗапрос: Chrome, macOS, \\d{1,2} [а-я]+, \\d{2}:\\d{2}\\. '
			+ 'Если привязку начинали не вы, нажмите «Это не я»\\.$',
			'u'
		));
		expect(offer.input.keyboard?.[0]?.map((button) => button.text)).toEqual(['Привязать', 'Это не я']);
		expect(lastButtons(harness.bot).confirm).toBe(`tgk:ok:${code}`);
		// `/start` alone links nothing.
		expect(requestRow(code)?.status).toBe('pending');
		expect((await sergei.linkComplete(code)).body).toEqual({ ok: true, status: 'pending' });
		expect(await database.select().from(telegramAccounts)).toEqual([]);

		await deliver(harness, buttonPress(ANNA, lastButtons(harness.bot).confirm));

		expect(requestRow(code)).toMatchObject({ status: 'confirmed', telegramId: '1001' });
		expect(lastEditedText(harness.bot)).toBe('Готово, вернитесь в i-finances, чтобы завершить привязку.');
		expect(harness.bot.callsTo('editMessageText').at(-1)?.input.keyboard).toBeUndefined();
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(1);
		// Confirmed, but not linked until the browser of the user takes it.
		expect(await database.select().from(telegramAccounts)).toEqual([]);

		const done = await sergei.linkComplete(code);

		expect(done.response.status).toBe(200);
		expect(done.body).toEqual({ ok: true, status: 'linked', telegram: { username: 'anna_k' } });
		expect(done.response.headers.getSetCookie().some((header) => header.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
		expect(sergei.cookies.get(SESSION_COOKIE)).toBe(sessionToken);
		expect(sergei.cookies.has(TG_COOKIE)).toBe(false);
		expect(await database.select().from(telegramAccounts)).toEqual([expect.objectContaining({
			chatId: '1001',
			firstName: 'Анна',
			lastName: 'Каренина',
			telegramId: '1001',
			userId: 'sergei',
			username: 'anna_k'
		})]);
		expect(requestRow(code)?.status).toBe('used');
		expect(await database.select().from(sessions)).toHaveLength(2);
		expect((await sergei.get('/api/auth/session')).body).toMatchObject({
			authenticated: true,
			hasPassword: true,
			telegram: { username: 'anna_k' },
			user: { id: 'sergei' }
		});

		// Once used, the same code links nothing again, even with the old cookie.
		const replay = await sergei.post('/api/auth/telegram/link/complete', { code }, {
			cookie: `${SESSION_COOKIE}=${sessionToken}; ${TG_COOKIE}=${tgCookie.split(';')[0].split('=')[1]}`
		});

		expect(replay.response.status).toBe(410);
		expect(replay.body).toMatchObject({ errorCode: 'link-expired', ok: false });

		// And now the linked Telegram signs sergei in, with registration still closed: no duplicate (Р9).
		const signIn = new Browser(harness, undefined, '198.51.100.8');
		const { body: signInStart } = await signIn.post('/api/auth/telegram/start');
		const signInCode = (signInStart as { code: string }).code;

		await deliver(harness, startMessage(ANNA, `/start ${signInCode}`));
		await deliver(harness, buttonPress(ANNA, lastButtons(harness.bot).confirm));

		expect((await signIn.post('/api/auth/telegram/complete', { code: signInCode })).body)
			.toEqual({ hasHousehold: true, isNewUser: false, ok: true, status: 'confirmed' });
		expect((await signIn.get('/api/auth/session')).body).toMatchObject({ user: { id: 'sergei' } });
		expect(await database.select().from(users)).toHaveLength(2);
	});

	it('the member links her own Telegram the same way', async () => {
		const harness = boot();
		const olga = new Browser(harness, 'olga-phone');
		const code = await olga.linkStart();

		await deliver(harness, startMessage(MALLORY, `/start ${code}`));

		expect(harness.bot.callsTo('sendMessage').at(-1)?.input.text)
			.toMatch(/^Привязать Telegram-аккаунт к i-finances\? \(аккаунт «Ольга»\)/u);

		await deliver(harness, buttonPress(MALLORY, lastButtons(harness.bot).confirm));

		expect((await olga.linkComplete(code)).body).toEqual({ ok: true, status: 'linked', telegram: { username: null } });
		expect(await database.select({ telegramId: telegramAccounts.telegramId, userId: telegramAccounts.userId }).from(telegramAccounts))
			.toEqual([{ telegramId: '6666', userId: 'olga' }]);
	});

	it('names the account without line breaks or direction characters a display name could carry', async () => {
		await database.update(users).set({ displayName: 'Сергей\n‮Вход подтверждён​' }).where(eq(users.id, 'sergei'));

		const harness = boot();
		const code = await new Browser(harness, 'sergei-laptop').linkStart();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		expect(harness.bot.callsTo('sendMessage').at(-1)?.input.text)
			.toMatch(/^Привязать Telegram-аккаунт к i-finances\? \(аккаунт «Сергей Вход подтверждён»\)\nЗапрос:/u);
	});
});

describe('only the user, from the browser session, in the browser that started', () => {
	it('the MCP bearer key gets 401 on both routes and creates nothing, although it works elsewhere', async () => {
		const harness = boot();
		const bearer = { authorization: `Bearer ${MCP_API_KEY}`, 'content-type': 'application/json', origin: ORIGIN };

		expect((await harness.app.request('/api/accounts', { headers: bearer })).status).toBe(200);

		for (const path of ['/api/auth/telegram/link/start', '/api/auth/telegram/link/complete']) {
			const body = JSON.stringify({ code: UNKNOWN_CODE });
			const response = await harness.app.request(path, { body, headers: bearer, method: 'POST' });

			expect(response.status, path).toBe(401);
			expect(await response.json()).toMatchObject({ errorCode: 'unauthenticated', ok: false });
			expect(response.headers.getSetCookie()).toEqual([]);
		}

		expect(await database.select().from(telegramLoginRequests)).toEqual([]);
	});

	it('the MCP key cannot complete the link the user started either', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);

		const response = await harness.app.request('/api/auth/telegram/link/complete', {
			body: JSON.stringify({ code }),
			headers: {
				authorization: `Bearer ${MCP_API_KEY}`,
				'content-type': 'application/json',
				cookie: `${TG_COOKIE}=${sergei.cookies.get(TG_COOKIE) ?? ''}`,
				origin: ORIGIN
			},
			method: 'POST'
		});

		expect(response.status).toBe(401);
		expect(requestRow(code)?.status).toBe('confirmed');
		expect(await database.select().from(telegramAccounts)).toEqual([]);
	});

	it('without a session: 401 and nothing created', async () => {
		const browser = new Browser(boot());
		const start = await browser.post('/api/auth/telegram/link/start');
		const complete = await browser.linkComplete(UNKNOWN_CODE);

		expect([start.response.status, complete.response.status]).toEqual([401, 401]);
		expect(start.response.headers.getSetCookie()).toEqual([]);
		expect(await database.select().from(telegramLoginRequests)).toEqual([]);
	});

	it.each(['/api/auth/telegram/link/start', '/api/auth/telegram/link/complete'])(
		'%s refuses a cross-origin request before doing anything',
		async (path) => {
			const browser = new Browser(boot(), 'sergei-laptop');
			const { body, response } = await browser.post(path, { code: UNKNOWN_CODE }, { origin: 'https://evil.example' });

			expect(response.status).toBe(403);
			expect(body).toMatchObject({ errorCode: 'invalid-origin', ok: false });
			expect(await database.select().from(telegramLoginRequests)).toEqual([]);
		}
	);

	it('another user, even with the stolen request cookie, gets the answer of an unknown code and links nothing', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);

		const olga = new Browser(harness, 'olga-phone', '203.0.113.9');

		olga.cookies.set(TG_COOKIE, sergei.cookies.get(TG_COOKIE) ?? '');

		const unknown = await olga.linkComplete(UNKNOWN_CODE);
		const stolen = await olga.linkComplete(code);
		// sergei himself in another browser, without the request cookie.
		const otherBrowser = await new Browser(harness, 'sergei-laptop', '203.0.113.10').linkComplete(code);

		for (const answer of [unknown, stolen, otherBrowser]) {
			expect(answer.response.status).toBe(403);
			expect(answer.body).toEqual(unknown.body);
		}

		expect(unknown.body).toMatchObject({ errorCode: 'browser-mismatch' });
		expect(requestRow(code)?.status).toBe('confirmed');
		expect(await database.select().from(telegramAccounts)).toEqual([]);
		expect((await sergei.linkComplete(code)).body).toMatchObject({ status: 'linked' });
	});

	it('a link request never signs anyone in, and a sign-in request never links', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const linkCode = await sergei.linkStart();

		await confirmLinkInBot(harness, linkCode);

		// The sign-in poll of the same browser with the same cookie does not take a link confirmation.
		const asSignIn = await sergei.post('/api/auth/telegram/complete', { code: linkCode });

		expect(asSignIn.response.status).toBe(403);
		expect(asSignIn.body).toMatchObject({ errorCode: 'browser-mismatch' });
		expect(requestRow(linkCode)?.status).toBe('confirmed');

		const signInCode = await new Browser(harness).post('/api/auth/telegram/start')
			.then(({ body }) => (body as { code: string }).code);
		const asLink = await sergei.linkComplete(signInCode);

		expect(asLink.response.status).toBe(403);
		expect(asLink.body).toMatchObject({ errorCode: 'browser-mismatch' });

		// Buttons are bound to their kind of request: a sign-in button on a link code and the reverse change nothing.
		const fresh = await sergei.linkStart();

		await deliver(harness, buttonPress(ANNA, `tgl:ok:${fresh}`));
		expect(requestRow(fresh)?.status).toBe('pending');
		expect(lastEditedText(harness.bot)).toMatch(/^Ссылка устарела\. Вернитесь в i-finances и начните вход заново\./u);

		await deliver(harness, buttonPress(ANNA, `tgk:ok:${signInCode}`));
		expect(requestRow(signInCode)?.status).toBe('pending');
		expect(lastEditedText(harness.bot)).toMatch(/^Ссылка устарела\. Вернитесь в i-finances и начните привязку заново\./u);
	});
});

describe('the Telegram linked is always the presser\'s own, from the private chat', () => {
	it('a press outside the presser\'s private chat changes nothing, a group /start gets no answer', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await deliver(harness, startMessage(ANNA, `/start ${code}`, { id: -100_500, type: 'group' }));
		expect(harness.bot.callsTo('sendMessage')).toEqual([]);

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const { confirm } = lastButtons(harness.bot);

		// Mallory presses the button of the message in Anna's chat, or in a group: from ≠ chat.
		await deliver(harness, buttonPress(MALLORY, confirm, ANNA.id));
		await deliver(harness, buttonPress(MALLORY, confirm, -100_500));
		await deliver(harness, buttonPress(ANNA, confirm, -100_500));

		expect(requestRow(code)?.status).toBe('pending');
		expect(harness.bot.callsTo('editMessageText')).toEqual([]);
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(3);
		expect((await sergei.linkComplete(code)).body).toEqual({ ok: true, status: 'pending' });

		// Whoever confirms in their own chat links their own Telegram, never someone else's.
		await deliver(harness, buttonPress(MALLORY, confirm));

		expect(requestRow(code)).toMatchObject({ status: 'confirmed', telegramId: '6666' });
		expect((await sergei.linkComplete(code)).body).toMatchObject({ status: 'linked' });
		expect(await database.select({ telegramId: telegramAccounts.telegramId }).from(telegramAccounts)).toEqual([{ telegramId: '6666' }]);
	});

	it('«Это не я» rejects the link for good', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const buttons = lastButtons(harness.bot);

		await deliver(harness, buttonPress(ANNA, buttons.reject));
		expect(lastEditedText(harness.bot)).toBe('Привязка отклонена, ничего не изменилось.');

		await deliver(harness, buttonPress(ANNA, buttons.confirm));
		expect(requestRow(code)).toMatchObject({ status: 'rejected', telegramId: null });

		const { body, response } = await sergei.linkComplete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'link-rejected' });
		expect(sergei.cookies.has(TG_COOKIE)).toBe(false);
		expect(await database.select().from(telegramAccounts)).toEqual([]);
	});

	it('an expired confirmation links nothing; the bot calls an expired link request expired', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		database.update(telegramLoginRequests).set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(telegramLoginRequests.code, code)).run();

		const { body, response } = await sergei.linkComplete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'link-expired' });
		expect(await database.select().from(telegramAccounts)).toEqual([]);

		await deliver(harness, startMessage(ANNA, `/start ${code}`));
		expect(harness.bot.callsTo('sendMessage').at(-1)?.input).toEqual({
			chatId: ANNA.id,
			text: 'Ссылка устарела. Вернитесь в i-finances и начните привязку заново.'
		});
	});

	it('cancel abandons a link request too', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		expect((await sergei.post('/api/auth/telegram/cancel', { code })).body).toEqual({ ok: true });
		expect(requestRow(code)?.status).toBe('rejected');
	});
});

describe('conflicts (409, nothing changes)', () => {
	it('link/start refuses a user who already has a Telegram: v1 cannot unlink', async () => {
		await database.insert(telegramAccounts).values({
			chatId: '5', firstName: 'С', lastName: null, lastSignInAt: AT, linkedAt: AT, telegramId: '5', updatedAt: AT, userId: 'sergei',
			username: null
		});

		const { body, response } = await new Browser(boot(), 'sergei-laptop').post('/api/auth/telegram/link/start');

		expect(response.status).toBe(409);
		expect(body).toEqual({ errorCode: 'account-has-telegram', message: 'К аккаунту уже привязан другой Telegram.', ok: false });
		expect(response.headers.getSetCookie()).toEqual([]);
		expect(await database.select().from(telegramLoginRequests)).toEqual([]);
	});

	it('a Telegram of another user with data: 409 in the browser, the bot says so, nothing changes', async () => {
		const harness = boot();
		const olga = new Browser(harness, 'olga-phone');
		const sergei = new Browser(harness, 'sergei-laptop');
		const olgaCode = await olga.linkStart();

		await confirmLinkInBot(harness, olgaCode);
		await olga.linkComplete(olgaCode);

		const before = snapshot();
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		expect(lastEditedText(harness.bot)).toBe('Этот Telegram уже привязан к другому аккаунту i-finances. Привязка не выполнена.');

		const { body, response } = await sergei.linkComplete(code);

		expect(response.status).toBe(409);
		expect(body).toEqual({ errorCode: 'telegram-linked-elsewhere', message: 'Этот Telegram привязан к другому аккаунту.', ok: false });
		expect(sergei.cookies.has(TG_COOKIE)).toBe(false);
		expect(snapshot()).toEqual(before);
		// The confirmation is spent: the same request cannot link later, whatever changes meanwhile.
		expect(requestRow(code)?.status).toBe('used');
	});

	const withData: Array<[string, () => Promise<void>]> = [
		['a password', async () => {
			await database.update(users).set({ passwordHash: PASSWORD_HASH }).where(eq(users.id, 'duplicate'));
		}],
		['any password hash, even one that is not usable', async () => {
			await database.update(users).set({ passwordHash: '!placeholder' }).where(eq(users.id, 'duplicate'));
		}],
		['a passkey', async () => {
			await database.insert(webauthnCredentials).values({
				backedUp: false, counter: 0, createdAt: AT, deviceType: 'singleDevice', id: 'dup-key', publicKey: 'cHVibGljLWtleQ',
				userId: 'duplicate'
			});
		}],
		['a deactivated account', async () => {
			await database.update(users).set({ isActive: false }).where(eq(users.id, 'duplicate'));
		}],
		['data in its own household', async () => {
			await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'dup-home', name: 'Моё', updatedAt: AT });
			await database.insert(householdMembers).values({ householdId: 'dup-home', joinedAt: AT, role: 'owner', userId: 'duplicate' });
			await insertAccount('dup-card', 'dup-home', 'duplicate');
		}],
		['another member in its (empty) household', async () => {
			await database.insert(users).values({
				createdAt: AT, displayName: 'Гость', id: 'guest', isActive: true, passwordHash: null, updatedAt: AT, username: 'guest'
			});
			await database.insert(households).values({ baseCurrency: 'BYN', createdAt: AT, id: 'dup-home', name: 'Моё', updatedAt: AT });
			await database.insert(householdMembers).values([
				{ householdId: 'dup-home', joinedAt: AT, role: 'owner', userId: 'duplicate' },
				{ householdId: 'dup-home', joinedAt: AT, role: 'member', userId: 'guest' }
			]);
		}],
		['membership in the family household', async () => {
			await database.insert(householdMembers).values({ householdId: 'family', joinedAt: AT, role: 'member', userId: 'duplicate' });
		}],
		['data it wrote in a household it has left', async () => {
			await insertAccount('dup-wrote', 'family', 'duplicate');
		}],
		['an invitation it created', async () => {
			await database.insert(householdInvitations).values({
				createdAt: AT, createdByUserId: 'duplicate', expiresAt: AT, householdId: 'family', id: 'inv', tokenHash: 'h'.repeat(64)
			});
		}]
	];

	it.each(withData)('the duplicate is kept and the link refused when it has %s', async (_case, addData) => {
		await seedDuplicate();
		await addData();

		const before = snapshot();
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);

		const { body, response } = await sergei.linkComplete(code);

		expect(response.status).toBe(409);
		expect(body).toMatchObject({ errorCode: 'telegram-linked-elsewhere' });
		expect(snapshot()).toEqual(before);
	});

	it('the user got another Telegram meanwhile (two link requests): the second one is 409 account-has-telegram', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const tablet = new Browser(harness, 'sergei-laptop', '198.51.100.9');
		const phone = new Browser(harness, 'sergei-laptop', '198.51.100.10');
		const first = await sergei.linkStart();
		const second = await tablet.linkStart();
		const third = await phone.linkStart();

		await confirmLinkInBot(harness, first, ANNA);
		await confirmLinkInBot(harness, second, MALLORY);
		expect((await sergei.linkComplete(first)).body).toMatchObject({ status: 'linked', telegram: { username: 'anna_k' } });

		const before = snapshot();
		const { body, response } = await tablet.linkComplete(second);

		expect(response.status).toBe(409);
		expect(body).toEqual({ errorCode: 'account-has-telegram', message: 'К аккаунту уже привязан другой Telegram.', ok: false });
		expect(snapshot()).toEqual(before);

		// The bot tells it right away to whoever confirms after the first link.
		await confirmLinkInBot(harness, third, MALLORY);
		expect(lastEditedText(harness.bot)).toBe('К аккаунту i-finances «Сергей» уже привязан другой Telegram. Привязка не выполнена.');
		expect((await phone.linkComplete(third)).response.status).toBe(409);
		expect(snapshot()).toEqual(before);
	});

	it('the same Telegram confirmed twice for the same user: the second complete is idempotent', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const tablet = new Browser(harness, 'sergei-laptop', '198.51.100.9');
		const first = await sergei.linkStart();
		const second = await tablet.linkStart();

		await confirmLinkInBot(harness, first, ANNA);
		await confirmLinkInBot(harness, second, { ...ANNA, username: 'anna_new' });
		expect((await sergei.linkComplete(first)).body).toMatchObject({ status: 'linked' });
		expect((await tablet.linkComplete(second)).body).toEqual({ ok: true, status: 'linked', telegram: { username: 'anna_new' } });
		expect(await database.select({ userId: telegramAccounts.userId, username: telegramAccounts.username }).from(telegramAccounts))
			.toEqual([{ userId: 'sergei', username: 'anna_new' }]);
	});
});

describe('merging an empty duplicate (Р9)', () => {
	it('a duplicate without a household: it and its sessions go, the Telegram moves, the user stays signed in', async () => {
		await seedDuplicate();

		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const duplicate = new Browser(harness, 'duplicate-phone');

		expect((await duplicate.get('/api/auth/session')).body).toMatchObject({ user: { id: 'duplicate' } });

		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		// An empty duplicate does not stop the link, so the bot says «Готово».
		expect(lastEditedText(harness.bot)).toBe('Готово, вернитесь в i-finances, чтобы завершить привязку.');

		const { body, response } = await sergei.linkComplete(code);

		expect(response.status).toBe(200);
		expect(body).toEqual({ ok: true, status: 'linked', telegram: { username: 'anna_k' } });
		expect(await database.select({ id: users.id }).from(users).orderBy(users.id)).toEqual([{ id: 'olga' }, { id: 'sergei' }]);
		expect(await database.select().from(telegramAccounts)).toEqual([expect.objectContaining({
			chatId: '1001', telegramId: '1001', userId: 'sergei', username: 'anna_k'
		})]);
		expect((await database.select({ id: sessions.id }).from(sessions).orderBy(sessions.id)))
			.toEqual([{ id: 'olga-phone' }, { id: 'sergei-laptop' }]);
		expect((await duplicate.get('/api/auth/session')).body).toMatchObject({ authenticated: false });
		expect((await sergei.get('/api/auth/session')).body).toMatchObject({ telegram: { username: 'anna_k' }, user: { id: 'sergei' } });
		expect(connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('a duplicate alone in an empty household: the household goes too, the family household stays', async () => {
		await seedDuplicate({ household: true });
		await database.insert(householdInvitations).values({
			createdAt: AT, createdByUserId: 'sergei', expiresAt: AT, householdId: 'family', id: 'family-inv', tokenHash: 'f'.repeat(64)
		});

		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		expect((await sergei.linkComplete(code)).body).toMatchObject({ status: 'linked' });
		expect(await database.select({ id: households.id }).from(households)).toEqual([{ id: 'family' }]);
		expect(await database.select({ userId: householdMembers.userId }).from(householdMembers).orderBy(householdMembers.userId))
			.toEqual([{ userId: 'olga' }, { userId: 'sergei' }]);
		expect(await database.select({ id: accounts.id }).from(accounts)).toEqual([{ id: 'family-card' }]);
		expect(await database.select({ id: householdInvitations.id }).from(householdInvitations)).toEqual([{ id: 'family-inv' }]);
		expect(await database.select({ id: users.id }).from(users).orderBy(users.id)).toEqual([{ id: 'olga' }, { id: 'sergei' }]);
		expect(connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('the duplicate gets data between the bot confirmation and the complete: 409, nothing deleted', async () => {
		await seedDuplicate({ household: true });

		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		expect(lastEditedText(harness.bot)).toBe('Готово, вернитесь в i-finances, чтобы завершить привязку.');
		await insertAccount('dup-card', 'dup-home', 'duplicate');

		const before = snapshot();

		expect((await sergei.linkComplete(code)).response.status).toBe(409);
		expect(snapshot()).toEqual(before);
	});

	it('afterwards the Telegram signs in to the main account; no duplicate comes back', async () => {
		await seedDuplicate({ household: true });

		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);
		await sergei.linkComplete(code);

		const phone = new Browser(harness, undefined, '198.51.100.50');
		const { body } = await phone.post('/api/auth/telegram/start');
		const signInCode = (body as { code: string }).code;

		await confirmLinkInBot(harness, signInCode);
		expect((await phone.post('/api/auth/telegram/complete', { code: signInCode })).body)
			.toMatchObject({ hasHousehold: true, isNewUser: false, status: 'confirmed' });
		expect((await phone.get('/api/auth/session')).body).toMatchObject({ household: { id: 'family' }, user: { id: 'sergei' } });
	});
});

describe('races and repeats', () => {
	it('two parallel completes of one link: one links, the other gets «expired»', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await confirmLinkInBot(harness, code);

		const tab = new Browser(harness, 'sergei-laptop');

		tab.cookies.set(TG_COOKIE, sergei.cookies.get(TG_COOKIE) ?? '');

		const answers = await Promise.all([sergei.linkComplete(code), tab.linkComplete(code)]);

		expect(answers.map((answer) => answer.response.status).sort()).toEqual([200, 410]);
		expect(await database.select().from(telegramAccounts)).toHaveLength(1);
	});

	it('two users race to link the same Telegram: exactly one gets it, the other 409', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const olga = new Browser(harness, 'olga-phone', '198.51.100.9');
		const sergeiCode = await sergei.linkStart();
		const olgaCode = await olga.linkStart();

		await confirmLinkInBot(harness, sergeiCode);
		await confirmLinkInBot(harness, olgaCode);

		const answers = await Promise.all([sergei.linkComplete(sergeiCode), olga.linkComplete(olgaCode)]);

		expect(answers.map((answer) => answer.response.status).sort()).toEqual([200, 409]);
		expect(answers.find((answer) => answer.response.status === 409)?.body).toMatchObject({ errorCode: 'telegram-linked-elsewhere' });
		expect(await database.select().from(telegramAccounts)).toHaveLength(1);
		expect(await database.select().from(users)).toHaveLength(2);
	});

	it('a redelivered «Привязать» after a restart changes nothing', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop');
		const code = await sergei.linkStart();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const press = { ...buttonPress(ANNA, lastButtons(harness.bot).confirm), update_id: 900 };

		await deliver(harness, press);

		const confirmed = requestRow(code);
		const restarted = boot();

		await deliver(restarted, press);
		expect(requestRow(code)).toEqual(confirmed);
		expect(lastEditedText(restarted.bot)).toBe('Готово, вернитесь в i-finances, чтобы завершить привязку.');

		await deliver(restarted, { ...buttonPress(MALLORY, lastButtons(harness.bot).confirm), update_id: 901 });
		expect(requestRow(code)).toMatchObject({ telegramId: '1001' });
		expect(lastEditedText(restarted.bot)).toBe('Ссылка устарела. Вернитесь в i-finances и начните привязку заново.');
	});
});

describe('limits, availability, dev confirmation', () => {
	it('link/start shares the limit of 10 starts per 5 minutes per address with the sign-in start', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop', '198.51.100.20');

		for (let attempt = 0; attempt < 5; attempt += 1) {
			expect((await sergei.post('/api/auth/telegram/start')).response.status).toBe(200);
			expect((await sergei.post('/api/auth/telegram/link/start')).response.status).toBe(200);
		}

		const blocked = await sergei.post('/api/auth/telegram/link/start');

		expect(blocked.response.status).toBe(429);
		expect(blocked.body).toMatchObject({ errorCode: 'rate-limited' });
		expect(Number(blocked.response.headers.get('retry-after'))).toBeGreaterThan(0);
		expect((await new Browser(harness, 'sergei-laptop', '198.51.100.21').post('/api/auth/telegram/link/start')).response.status)
			.toBe(200);
	});

	it('link/complete is limited to 300 per 5 minutes per address', async () => {
		const harness = boot();
		const sergei = new Browser(harness, 'sergei-laptop', '198.51.100.30');
		const code = await sergei.linkStart();

		for (let attempt = 0; attempt < 300; attempt += 1) {
			expect((await sergei.linkComplete(code)).response.status).toBe(200);
		}

		expect((await sergei.linkComplete(code)).response.status).toBe(429);
	});

	it('without a bot that receives updates, link/start says Telegram is unavailable', async () => {
		vi.stubEnv('TELEGRAM_UPDATES', 'off');

		const { body, response } = await new Browser(boot(), 'sergei-laptop').post('/api/auth/telegram/link/start');

		expect(response.status).toBe(404);
		expect(body).toMatchObject({ errorCode: 'telegram-unavailable' });
	});

	it('DEV_TELEGRAM_LOGIN confirms a link request from this machine only', async () => {
		vi.stubEnv('TELEGRAM_UPDATES', 'off');
		vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
		vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');

		const sergei = new Browser(boot(), 'sergei-laptop');
		const code = await sergei.linkStart();
		const identity = { code, firstName: 'Сергей', telegramId: '4242', username: 'sergei_tg' };

		expect((await sergei.post('/api/dev/telegram/confirm', identity, { host: 'localhost' }, '192.168.1.5')).response.status).toBe(404);
		expect((await sergei.post('/api/dev/telegram/confirm', identity, {}, '127.0.0.1')).body).toEqual({ ok: true });
		expect((await sergei.linkComplete(code)).body).toEqual({ ok: true, status: 'linked', telegram: { username: 'sergei_tg' } });
	});
});

describe('the merge rules cover the schema', () => {
	type ForeignKey = { from: string; on_delete: string; table: string };

	function foreignKeys(): Array<ForeignKey & { owner: string }> {
		const tables = connection.prepare(
			'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\' AND name NOT LIKE \'__drizzle%\''
		).all() as Array<{ name: string }>;

		return tables.flatMap(({ name }) => (connection.prepare(`PRAGMA foreign_key_list("${name}")`).all() as ForeignKey[])
			.map((key) => ({ ...key, owner: name })));
	}

	const listed = (references: typeof USER_AUTHORSHIP_REFERENCES) => references
		.map(({ column, table }) => `${getTableName(table)}.${column.name}`)
		.sort();

	it('every reference to users without ON DELETE CASCADE is an authorship the merge checks', () => {
		const required = foreignKeys()
			.filter((key) => key.table === 'users' && key.on_delete !== 'CASCADE')
			.map((key) => `${key.owner}.${key.from}`)
			.sort();

		expect(listed(USER_AUTHORSHIP_REFERENCES)).toEqual(required);
	});

	it('every table that hangs on a household, except membership and invitations, is household data the merge checks', () => {
		const required = foreignKeys()
			.filter((key) => key.table === 'households' && !['household_members', 'household_invitations'].includes(key.owner))
			.map((key) => `${key.owner}.${key.from}`)
			.sort();

		expect(listed(HOUSEHOLD_DATA_REFERENCES)).toEqual(required);
	});
});
