import { createHash } from 'node:crypto';

import type { createApiApp as CreateApiApp } from '@/app';
import type {
	createApiDependencies as CreateApiDependencies,
	toApiAppDependencies as ToApiAppDependencies
} from '@/composition-root';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	householdMembers,
	households,
	sessions,
	telegramAccounts,
	telegramLoginRequests,
	users
} from '@/infrastructure/database/schema';
import type { TelegramUpdate } from '@/modules/telegram';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

/**
 * A3: sign-in and sign-up through the bot (flow 5.1), over HTTP on the real production graph (`createApiDependencies`)
 * with a fake bot client and a fresh `:memory:` database per test. Bot updates arrive through the real webhook route.
 */

const ORIGIN = 'http://localhost:5173';
const WEBHOOK_SECRET = 'sign-in-webhook-secret-0123456789abc';
const BOT_USERNAME = 'i_finances_test_bot';
const TG_COOKIE = 'i_finances_tg_login';
const SESSION_COOKIE = 'i_finances_session';
const CHROME_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
	+ '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANNA = { first_name: 'Анна', id: 1001, is_bot: false, last_name: 'Каренина', username: 'anna_k' };
const MALLORY = { first_name: 'Mallory', id: 6666, is_bot: false };
const UNKNOWN_CODE = 'nobodyhasthiscode000000000000000';

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

beforeEach(() => {
	nextUpdateId = 1;
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	vi.stubEnv('TELEGRAM_UPDATES', 'webhook');
	vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:sign-in-test-token');
	vi.stubEnv('TELEGRAM_BOT_USERNAME', BOT_USERNAME);
	vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
	vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'true');
	vi.stubEnv('DEV_TELEGRAM_LOGIN', '');
	vi.stubEnv('NODE_ENV', 'test');
});

afterEach(() => {
	connection.close();
});

/** Builds the server as `main.ts` does; a second call over the same database is a restart (fresh process memory). */
function boot(): Harness {
	const bot = new FakeTelegramBotClient();

	return { app: createApp(toAppDependencies(createDependencies(database, { telegramBotClient: bot }))), bot };
}

/** A browser: keeps the cookies the server sets, sends them back, has its own address and user agent. */
class Browser {
	public readonly cookies = new Map<string, string>();

	public constructor(
		private readonly harness: Harness,
		private readonly ipAddress = '198.51.100.7',
		private readonly userAgent = CHROME_ON_MAC
	) {}

	public async post(
		path: string,
		body?: unknown,
		extraHeaders: Record<string, string> = {},
		/** The TCP peer of the request, as the node server reports it; none (as with `app.request`) by default. */
		peerAddress?: string
	): Promise<{ body: unknown; response: Response }> {
		const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		const nodeBindings = peerAddress === undefined ? undefined : { incoming: { socket: { remoteAddress: peerAddress } } };
		const response = await this.harness.app.request(path, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: {
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...(cookie === '' ? {} : { cookie }),
				origin: ORIGIN,
				'user-agent': this.userAgent,
				// The proxy appends the real peer address; the client forges whatever it likes on the left.
				'x-forwarded-for': `10.0.0.1, ${this.ipAddress}`,
				...extraHeaders
			},
			method: 'POST'
		}, nodeBindings);

		this.adopt(response);

		return { body: await response.json() as unknown, response };
	}

	public async get(path: string): Promise<{ body: unknown; status: number }> {
		const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		const response = await this.harness.app.request(path, { headers: cookie === '' ? {} : { cookie } });

		return { body: await response.json() as unknown, status: response.status };
	}

	public async start(): Promise<string> {
		const { body, response } = await this.post('/api/auth/telegram/start');

		expect(response.status, JSON.stringify(body)).toBe(200);

		return (body as { code: string }).code;
	}

	public complete(code: string) {
		return this.post('/api/auth/telegram/complete', { code });
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
	const updateId = update.update_id ?? nextUpdateId++;

	return harness.app.request('/api/telegram/webhook', {
		body: JSON.stringify({ ...update, update_id: updateId }),
		headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
		method: 'POST'
	});
}

function startMessage(from: typeof ANNA | typeof MALLORY, text: string) {
	return { message: { chat: { id: from.id, type: 'private' }, date: 1_760_000_000, from, message_id: 50, text } };
}

function buttonPress(from: typeof ANNA | typeof MALLORY, data: string, chatId: number = from.id) {
	return { callback_query: { data, from, id: `cb-${nextUpdateId}`, message: { chat: { id: chatId, type: 'private' }, message_id: 77 } } };
}

/** The «Войти» and «Это не я» callback data of the last confirmation the bot sent. */
function lastButtons(bot: FakeTelegramBotClient): { confirm: string; reject: string } {
	const keyboard = bot.callsTo('sendMessage').at(-1)?.input.keyboard;
	const row = keyboard?.[0] ?? [];
	const confirm = row.at(0);
	const reject = row.at(1);

	if (confirm?.callbackData === undefined || reject?.callbackData === undefined) {
		throw new Error('The bot sent no confirmation buttons.');
	}

	return { confirm: confirm.callbackData, reject: reject.callbackData };
}

function lastEditedText(bot: FakeTelegramBotClient): string | undefined {
	return bot.callsTo('editMessageText').at(-1)?.input.text;
}

function requestRow(code: string) {
	return database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, code)).get();
}

function expireRequest(code: string): void {
	database.update(telegramLoginRequests).set({ expiresAt: new Date(Date.now() - 1000) })
		.where(eq(telegramLoginRequests.code, code)).run();
}

/** Start in the browser, `/start` in the bot, press «Войти». Returns the code. */
async function confirmInBot(harness: Harness, browser: Browser, from: typeof ANNA | typeof MALLORY = ANNA): Promise<string> {
	const code = await browser.start();

	await deliver(harness, startMessage(from, `/start ${code}`));
	await deliver(harness, buttonPress(from, lastButtons(harness.bot).confirm));

	return code;
}

async function seedLinkedUser(options: { isActive?: boolean; withHousehold?: boolean } = {}): Promise<void> {
	const at = new Date('2026-10-01T10:00:00.000Z');

	await database.insert(users).values({
		createdAt: at,
		displayName: 'Сергей',
		id: 'sergei',
		isActive: options.isActive ?? true,
		passwordHash: null,
		updatedAt: at,
		username: 'sergei'
	});
	await database.insert(telegramAccounts).values({
		chatId: '1',
		firstName: 'Старое имя',
		lastName: null,
		lastSignInAt: at,
		linkedAt: at,
		telegramId: String(ANNA.id),
		updatedAt: at,
		userId: 'sergei',
		username: 'old_name'
	});

	if (options.withHousehold === true) {
		await database.insert(households).values({ baseCurrency: 'BYN', createdAt: at, id: 'family', name: 'Семья', updatedAt: at });
		await database.insert(householdMembers).values({ householdId: 'family', joinedAt: at, role: 'owner', userId: 'sergei' });
	}
}

describe('Telegram sign-up: the whole path', () => {
	it('start → /start shows the device and buttons → «Войти» → complete creates a user without password or household', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const { body: startBody, response: startResponse } = await browser.post('/api/auth/telegram/start');
		const { code } = startBody as { code: string };
		const tgCookie = startResponse.headers.getSetCookie().find((header) => header.startsWith(`${TG_COOKIE}=`)) ?? '';

		expect(startBody).toEqual({
			appUrl: `tg://resolve?domain=${BOT_USERNAME}&start=${code}`,
			botUrl: `https://t.me/${BOT_USERNAME}?start=${code}`,
			code,
			expiresAt: expect.any(String),
			ok: true
		});
		expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(tgCookie).toMatch(/HttpOnly/);
		expect(tgCookie).toMatch(/SameSite=Lax/);
		expect(tgCookie).toMatch(/Path=\/api\/auth\/telegram(;|$)/);
		expect(tgCookie).toMatch(/Max-Age=600(;|$)/);

		// Waiting: nothing about anyone yet.
		const pending = await browser.complete(code);

		expect(pending.response.status).toBe(200);
		expect(pending.body).toEqual({ ok: true, status: 'pending' });

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const [confirmation] = harness.bot.callsTo('sendMessage');

		expect(confirmation.input.chatId).toBe(ANNA.id);
		expect(confirmation.input.text).toMatch(new RegExp(
			'^Вход в i-finances: Chrome, macOS, \\d{1,2} [а-я]+, \\d{2}:\\d{2}\\.\\n'
			+ 'Нажимайте «Войти», только если вы сами только что начали вход на localhost:5173\\. '
			+ 'Если ссылку на бота вам кто-то прислал, нажмите «Это не я»\\.$',
			'u'
		));
		expect(confirmation.input.keyboard?.[0]?.map((button) => button.text)).toEqual(['Войти', 'Это не я']);
		// `/start` alone confirms nothing (phishing protection, Р11).
		expect(requestRow(code)?.status).toBe('pending');
		expect((await browser.complete(code)).body).toEqual({ ok: true, status: 'pending' });

		await deliver(harness, buttonPress(ANNA, lastButtons(harness.bot).confirm));

		expect(requestRow(code)).toMatchObject({ status: 'confirmed', telegramId: '1001', username: 'anna_k' });
		expect(lastEditedText(harness.bot)).toBe('Вход подтверждён. Вернитесь в i-finances.');
		expect(harness.bot.callsTo('editMessageText').at(-1)?.input.keyboard).toBeUndefined();
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(1);

		const done = await browser.complete(code);

		expect(done.response.status).toBe(200);
		expect(done.body).toEqual({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });
		expect(browser.cookies.has(SESSION_COOKIE)).toBe(true);
		expect(browser.cookies.has(TG_COOKIE)).toBe(false);

		const [user] = await database.select().from(users);

		expect(user).toMatchObject({ displayName: 'Анна Каренина', isActive: true, passwordHash: null, username: 'tg-1001' });
		expect(await database.select().from(telegramAccounts)).toEqual([expect.objectContaining({
			chatId: '1001',
			firstName: 'Анна',
			lastName: 'Каренина',
			telegramId: '1001',
			userId: user.id,
			username: 'anna_k'
		})]);
		expect(await database.select().from(householdMembers)).toEqual([]);
		expect(await database.select().from(sessions)).toEqual([expect.objectContaining({
			ipAddress: '198.51.100.7',
			userAgent: CHROME_ON_MAC,
			userId: user.id
		})]);

		// The new user is in onboarding: signed in, no household, no password, Telegram linked.
		expect(await browser.get('/api/auth/session')).toEqual({
			body: {
				authenticated: true,
				// Registration open, no invitation: signed up, but may not found a household (app-invitations-v1.md, 13).
				canCreateHousehold: false,
				hasPassword: false,
				household: null,
				isPlatformAdmin: false,
				telegram: { username: 'anna_k' },
				user: { displayName: 'Анна Каренина', id: user.id, username: 'tg-1001' }
			},
			status: 200
		});

		for (const path of ['/api/accounts', '/api/categories', '/api/operations/balances', '/api/household']) {
			const answer = await browser.get(path);

			expect(answer.status, path).toBe(403);
			expect(answer.body, path).toMatchObject({ errorCode: 'household-required', ok: false });
		}

		// Used once: the same code never gives a second session.
		const replayedCookie = `${TG_COOKIE}=${tgCookie.split(';')[0].split('=')[1]}`;
		const again = await browser.post('/api/auth/telegram/complete', { code }, { cookie: replayedCookie });

		expect(again.response.status).toBe(410);
		expect(again.body).toMatchObject({ errorCode: 'login-expired', ok: false });
		expect(await database.select().from(sessions)).toHaveLength(1);
	});

	it('keeps only the hash of the browser secret', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();
		const secret = decodeURIComponent(browser.cookies.get(TG_COOKIE) ?? '');
		const row = requestRow(code);

		expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(row?.secretHash).toBe(createHash('sha256').update(secret).digest('hex'));
		expect(JSON.stringify(connection.prepare('SELECT * FROM telegram_login_requests').all())).not.toContain(secret);
		expect(row).toMatchObject({
			ipAddress: '198.51.100.7',
			purpose: 'sign-in',
			status: 'pending',
			telegramId: null,
			userAgent: CHROME_ON_MAC
		});
	});

	it('a new user without a household does not see another household', async () => {
		await seedLinkedUser({ withHousehold: true });
		await database.update(telegramAccounts).set({ telegramId: '424242' });

		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);

		expect((await browser.complete(code)).body).toMatchObject({ hasHousehold: false, isNewUser: true });

		const session = await browser.get('/api/auth/session');
		const household = await browser.get('/api/household');

		expect(session.body).toMatchObject({ household: null });
		expect(household.status).toBe(403);
		expect(JSON.stringify([session.body, household.body])).not.toMatch(/Семья|family|sergei/u);
		expect(await database.select().from(householdMembers)).toHaveLength(1);
	});
});

describe('Telegram sign-in of a linked user', () => {
	it('signs in with registration closed and refreshes what Telegram reported', async () => {
		vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'false');
		await seedLinkedUser({ withHousehold: true });
		database.update(telegramAccounts).set({ botBlockedAt: new Date('2026-10-02T00:00:00.000Z') }).run();

		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);

		expect(lastEditedText(harness.bot)).toBe('Вход подтверждён. Вернитесь в i-finances.');
		expect((await browser.complete(code)).body).toEqual({ hasHousehold: true, isNewUser: false, ok: true, status: 'confirmed' });
		expect(await database.select().from(users)).toHaveLength(1);
		expect(await database.select().from(telegramAccounts)).toEqual([expect.objectContaining({
			botBlockedAt: null,
			chatId: '1001',
			firstName: 'Анна',
			userId: 'sergei',
			username: 'anna_k'
		})]);
		expect((await browser.get('/api/auth/session')).body).toMatchObject({
			hasPassword: false,
			household: { id: 'family', role: 'owner' },
			telegram: { username: 'anna_k' },
			user: { id: 'sergei' }
		});
	});

	it('refuses a deactivated user and creates no session', async () => {
		await seedLinkedUser({ isActive: false });

		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);
		const { body, response } = await browser.complete(code);

		expect(response.status).toBe(403);
		expect(body).toMatchObject({ errorCode: 'account-disabled', ok: false });
		expect(await database.select().from(sessions)).toEqual([]);
	});
});

describe('registration closed (TELEGRAM_REGISTRATION_ENABLED=false)', () => {
	it('an unknown Telegram gets «account not found» in the bot and in the browser, and no user is created', async () => {
		vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'false');

		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);

		expect(lastEditedText(harness.bot)).toMatch(/^Аккаунт i-finances для этого Telegram не найден/u);

		const { body, response } = await browser.complete(code);

		expect(response.status).toBe(403);
		expect(body).toMatchObject({ errorCode: 'registration-closed', ok: false });
		expect(browser.cookies.has(TG_COOKIE)).toBe(false);
		expect(browser.cookies.has(SESSION_COOKIE)).toBe(false);
		expect(await database.select().from(users)).toEqual([]);
		expect(await database.select().from(telegramAccounts)).toEqual([]);
		expect(await database.select().from(sessions)).toEqual([]);
	});

	it('is off when the variable is not set at all', async () => {
		vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', '');

		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);

		expect((await browser.complete(code)).body).toMatchObject({ errorCode: 'registration-closed' });
		expect(await database.select().from(users)).toEqual([]);
	});
});

describe('«Это не я» and other people', () => {
	it('rejects the request; a later «Войти» and the browser cannot revive it', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const buttons = lastButtons(harness.bot);

		await deliver(harness, buttonPress(ANNA, buttons.reject));

		expect(requestRow(code)?.status).toBe('rejected');
		expect(lastEditedText(harness.bot)).toMatch(/^Вход отклонён, ничего не изменилось\./u);

		await deliver(harness, buttonPress(ANNA, buttons.confirm));

		expect(requestRow(code)?.status).toBe('rejected');
		expect(requestRow(code)?.telegramId).toBeNull();
		expect(lastEditedText(harness.bot)).toMatch(/^Вход отклонён, ничего не изменилось\./u);
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(2);

		const { body, response } = await browser.complete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'login-rejected', ok: false });
		expect(await database.select().from(sessions)).toEqual([]);
	});

	it('a button pressed outside the private chat of the presser changes nothing', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));
		await deliver(harness, buttonPress(MALLORY, lastButtons(harness.bot).confirm, ANNA.id));

		expect(requestRow(code)?.status).toBe('pending');
		expect(harness.bot.callsTo('editMessageText')).toEqual([]);
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(1);
	});

	it('the browser of somebody else gets the same answer as for an unknown code, before and after confirmation', async () => {
		const harness = boot();
		const owner = new Browser(harness);
		const stranger = new Browser(harness, '203.0.113.9');
		const code = await owner.start();

		await stranger.start();

		const unknown = await stranger.complete(UNKNOWN_CODE);
		const foreignPending = await stranger.complete(code);

		await deliver(harness, startMessage(ANNA, `/start ${code}`));
		await deliver(harness, buttonPress(ANNA, lastButtons(harness.bot).confirm));

		const foreignConfirmed = await stranger.complete(code);
		const noCookie = await new Browser(harness, '203.0.113.10').complete(code);

		for (const answer of [unknown, foreignPending, foreignConfirmed, noCookie]) {
			expect(answer.response.status).toBe(403);
			expect(answer.body).toEqual(unknown.body);
		}

		expect(unknown.body).toMatchObject({ errorCode: 'browser-mismatch', ok: false });
		expect(stranger.cookies.has(SESSION_COOKIE)).toBe(false);
		expect(requestRow(code)?.status).toBe('confirmed');
		expect((await owner.complete(code)).body).toMatchObject({ ok: true, status: 'confirmed' });

		// Expired and used codes look the same to a stranger too.
		const used = await stranger.complete(code);

		expect(used.response.status).toBe(403);
		expect(used.body).toEqual(unknown.body);
	});
});

describe('expiry', () => {
	it('an expired request is not offered in the bot, cannot be confirmed and reports «expired» to its browser', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const buttons = lastButtons(harness.bot);

		expireRequest(code);
		await deliver(harness, buttonPress(ANNA, buttons.confirm));

		expect(requestRow(code)?.status).toBe('pending');
		expect(lastEditedText(harness.bot)).toMatch(/^Ссылка устарела\./u);

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		expect(harness.bot.callsTo('sendMessage').at(-1)?.input)
			.toEqual({ chatId: ANNA.id, text: expect.stringMatching(/^Ссылка устарела\./u) });

		const { body, response } = await browser.complete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'login-expired' });
		expect(browser.cookies.has(TG_COOKIE)).toBe(false);
	});

	it('a confirmation that expired before the browser came back gives no session and creates no user', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);

		expireRequest(code);

		const { body, response } = await browser.complete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'login-expired' });
		expect(requestRow(code)?.status).toBe('confirmed');
		expect(await database.select().from(users)).toEqual([]);
		expect(await database.select().from(sessions)).toEqual([]);
	});

	it('the bot greets a bare /start and calls an unknown code expired', async () => {
		const harness = boot();

		await deliver(harness, startMessage(ANNA, '/start'));
		await deliver(harness, startMessage(ANNA, `/start ${UNKNOWN_CODE}`));
		await deliver(harness, startMessage(ANNA, '/start not-a-code'));
		await deliver(harness, startMessage(ANNA, 'привет'));

		expect(harness.bot.callsTo('sendMessage').map((call) => call.input.text.slice(0, 20))).toEqual([
			'Здравствуйте! Это бо',
			'Ссылка устарела. Вер',
			'Ссылка устарела. Вер'
		]);
	});
});

describe('races and repeats', () => {
	it('two parallel completes of one confirmation: one session, the other gets «expired»', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);
		const tab = new Browser(harness);

		tab.cookies.set(TG_COOKIE, browser.cookies.get(TG_COOKIE) ?? '');

		const answers = await Promise.all([browser.complete(code), tab.complete(code)]);
		const statuses = answers.map((answer) => answer.response.status).sort();

		expect(statuses).toEqual([200, 410]);
		expect(await database.select().from(sessions)).toHaveLength(1);
		expect(await database.select().from(users)).toHaveLength(1);
	});

	it('a redelivered «Войти», also after a restart, changes nothing', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const press = { ...buttonPress(ANNA, lastButtons(harness.bot).confirm), update_id: 500 };

		await deliver(harness, press);

		const confirmed = requestRow(code);

		// Same process: the dispatcher drops the repeat before the handler.
		await deliver(harness, press);
		expect(harness.bot.callsTo('answerCallbackQuery')).toHaveLength(1);

		// After a restart the memory of update ids is gone; the conditional update still refuses.
		const restarted = boot();

		await deliver(restarted, press);
		expect(requestRow(code)).toEqual(confirmed);
		expect(lastEditedText(restarted.bot)).toBe('Вход подтверждён. Вернитесь в i-finances.');

		expect((await browser.complete(code)).body).toMatchObject({ status: 'confirmed' });

		// And once used, a late press by someone else neither reopens nor relabels it.
		const fourth = boot();

		await deliver(fourth, { ...buttonPress(MALLORY, lastButtons(harness.bot).confirm), update_id: 501 });
		expect(requestRow(code)).toMatchObject({ status: 'used', telegramId: '1001' });
		expect(lastEditedText(fourth.bot)).toMatch(/^Ссылка устарела\./u);
		expect(await database.select().from(sessions)).toHaveLength(1);
	});

	it('a complete after a restart is answered from the database, not from memory', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const code = await confirmInBot(harness, browser);
		const secret = browser.cookies.get(TG_COOKIE) ?? '';

		expect((await browser.complete(code)).response.status).toBe(200);

		const replay = new Browser(boot());

		replay.cookies.set(TG_COOKIE, secret);

		const { body, response } = await replay.complete(code);

		expect(response.status).toBe(410);
		expect(body).toMatchObject({ errorCode: 'login-expired' });
		expect(await database.select().from(sessions)).toHaveLength(1);
	});
});

describe('cancel', () => {
	it('ends the own request only; the bot cannot confirm it afterwards', async () => {
		const harness = boot();
		const browser = new Browser(harness);
		const stranger = new Browser(harness, '203.0.113.9');
		const code = await browser.start();

		await deliver(harness, startMessage(ANNA, `/start ${code}`));

		const buttons = lastButtons(harness.bot);
		const foreign = await stranger.post('/api/auth/telegram/cancel', { code });

		expect(foreign.body).toEqual({ ok: true });
		expect(requestRow(code)?.status).toBe('pending');

		const own = await browser.post('/api/auth/telegram/cancel', { code });

		expect(own.body).toEqual({ ok: true });
		expect(own.response.headers.getSetCookie().join()).toMatch(new RegExp(`${TG_COOKIE}=;.*Max-Age=0`, 'u'));
		expect(requestRow(code)?.status).toBe('rejected');

		await deliver(harness, buttonPress(ANNA, buttons.confirm));
		expect(requestRow(code)?.status).toBe('rejected');
	});
});

describe('request checks', () => {
	it.each(['/api/auth/telegram/start', '/api/auth/telegram/complete', '/api/auth/telegram/cancel'])(
		'%s refuses a cross-origin request before doing anything',
		async (path) => {
			const harness = boot();
			const browser = new Browser(harness);
			const { body, response } = await browser.post(path, { code: UNKNOWN_CODE }, { origin: 'https://evil.example' });

			expect(response.status).toBe(403);
			expect(body).toMatchObject({ errorCode: 'invalid-origin', ok: false });
			expect(response.headers.getSetCookie()).toEqual([]);
			expect(await database.select().from(telegramLoginRequests)).toEqual([]);
		}
	);

	it('refuses a malformed code and an oversized body', async () => {
		const browser = new Browser(boot());

		expect((await browser.complete('short')).response.status).toBe(400);
		const oversized = await browser.post('/api/auth/telegram/complete', { code: UNKNOWN_CODE, padding: 'x'.repeat(4096) });

		expect(oversized.response.status).toBe(413);
	});

	it('limits starts to 10 per 5 minutes per real address, whatever the client puts into X-Forwarded-For', async () => {
		const harness = boot();
		const browser = new Browser(harness, '198.51.100.20');

		for (let attempt = 0; attempt < 10; attempt += 1) {
			expect((await browser.post('/api/auth/telegram/start', undefined, {
				'x-forwarded-for': `10.0.0.${attempt}, 198.51.100.20`
			})).response.status).toBe(200);
		}

		const blocked = await browser.post('/api/auth/telegram/start');

		expect(blocked.response.status).toBe(429);
		expect(blocked.body).toMatchObject({ errorCode: 'rate-limited' });
		expect(Number(blocked.response.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(await database.select().from(telegramLoginRequests)).toHaveLength(10);
		expect((await new Browser(harness, '198.51.100.21').post('/api/auth/telegram/start')).response.status).toBe(200);
	});

	it('limits completes to 300 per 5 minutes per address', async () => {
		const harness = boot();
		const browser = new Browser(harness, '198.51.100.30');
		const code = await browser.start();

		for (let attempt = 0; attempt < 300; attempt += 1) {
			expect((await browser.complete(code)).response.status).toBe(200);
		}

		const blocked = await browser.complete(code);

		expect(blocked.response.status).toBe(429);
		expect(blocked.body).toMatchObject({ errorCode: 'rate-limited' });
		expect((await new Browser(harness, '198.51.100.31').complete(code)).response.status).toBe(403);
	});
});

describe('availability and the dev confirmation', () => {
	it('without a bot that receives updates, start says Telegram is unavailable and sets no cookie', async () => {
		vi.stubEnv('TELEGRAM_UPDATES', 'off');

		const browser = new Browser(boot());
		const { body, response } = await browser.post('/api/auth/telegram/start');

		expect(response.status).toBe(404);
		expect(body).toMatchObject({ errorCode: 'telegram-unavailable', ok: false });
		expect(response.headers.getSetCookie()).toEqual([]);
	});

	it('DEV_TELEGRAM_LOGIN confirms in place of the bot, and the browser completes as usual', async () => {
		vi.stubEnv('TELEGRAM_UPDATES', 'off');
		vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
		vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');

		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();
		const identity = { code, firstName: 'Тест', telegramId: '777' };
		const confirm = await browser.post('/api/dev/telegram/confirm', identity, {}, '127.0.0.1');

		expect(confirm.body).toEqual({ ok: true });
		expect((await browser.complete(code)).body).toMatchObject({ isNewUser: true, status: 'confirmed' });
		expect((await browser.post('/api/dev/telegram/confirm', identity, {}, '::1')).response.status).toBe(410);
		const crossOrigin = await browser.post('/api/dev/telegram/confirm', identity, { origin: 'https://evil.example' }, '127.0.0.1');

		expect(crossOrigin.response.status).toBe(403);
	});

	it('the dev confirmation answers only to this machine: a peer in the network gets 404 whatever Host and Origin say', async () => {
		vi.stubEnv('TELEGRAM_UPDATES', 'off');
		vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
		vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');

		const harness = boot();
		const browser = new Browser(harness);
		const code = await browser.start();
		const identity = { code, firstName: 'Захват', telegramId: '1001' };
		// Origin made of the forged Host passes the same-origin check: only the TCP peer can tell a remote client.
		const forged: Record<string, string> = { host: 'localhost:3001', origin: 'http://localhost:3001', 'x-forwarded-for': '127.0.0.1' };
		const headerSets: Array<Record<string, string>> = [{}, forged, { origin: ORIGIN }];
		const notFound = { error: { code: 'not_found', message: 'The requested resource was not found.' }, ok: false };

		for (const peer of [undefined, '192.168.1.23', '10.0.0.5', '::ffff:192.168.1.23', '127.0.0.2', 'fe80::1', '0.0.0.0']) {
			for (const headers of headerSets) {
				const answer = await browser.post('/api/dev/telegram/confirm', identity, headers, peer);

				expect(answer.response.status, `${peer} ${JSON.stringify(headers)}`).toBe(404);
				expect(answer.body).toEqual(notFound);
			}
		}

		// Not even the body limit gives the route away to a remote peer.
		const oversized = await browser.post('/api/dev/telegram/confirm', { ...identity, padding: 'x'.repeat(4096) }, {}, '192.168.1.23');

		expect(oversized.response.status).toBe(404);
		expect(requestRow(code)?.status).toBe('pending');
		expect(requestRow(code)?.telegramId).toBeNull();

		for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
			expect((await browser.post('/api/dev/telegram/confirm', { ...identity, code: UNKNOWN_CODE }, {}, peer)).response.status, peer)
				.toBe(410);
		}

		expect((await browser.post('/api/dev/telegram/confirm', identity, {}, '::ffff:127.0.0.1')).body).toEqual({ ok: true });
		expect(requestRow(code)).toMatchObject({ status: 'confirmed', telegramId: '1001' });
	});

	it('without DEV_TELEGRAM_LOGIN the dev route does not exist, also for this machine', async () => {
		const browser = new Browser(boot());
		const code = await browser.start();
		const identity = { code, firstName: 'Тест', telegramId: '777' };
		const { response } = await browser.post('/api/dev/telegram/confirm', identity, {}, '127.0.0.1');

		expect(response.status).toBe(404);
		expect(requestRow(code)?.status).toBe('pending');
	});

	it('the API refuses to start in production with DEV_TELEGRAM_LOGIN=true', () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.stubEnv('DEV_TELEGRAM_LOGIN', 'true');

		expect(() => boot()).toThrow(/DEV_TELEGRAM_LOGIN must not be enabled in production/);
	});
});
