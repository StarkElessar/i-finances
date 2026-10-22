import { createHash } from 'node:crypto';

import type { createApiApp as CreateApiApp } from '@/app';
import type {
	createApiDependencies as CreateApiDependencies,
	toApiAppDependencies as ToApiAppDependencies
} from '@/composition-root';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	appInvitations,
	householdInvitations,
	householdMembers,
	households,
	sessions,
	telegramAccounts,
	telegramLoginRequests,
	users
} from '@/infrastructure/database/schema';
import { getAppInvitationConfig } from '@/modules/app-invitation';
import { hashSessionToken, parsePlatformAdminUsernames } from '@/modules/auth';
import type { TelegramUpdate } from '@/modules/telegram';

import {
	appInvitationsResultSchema,
	createAppInvitationResultSchema,
	invitationPreviewResultSchema,
	MAX_ACTIVE_APP_INVITATIONS,
	MAX_APP_INVITATIONS_PER_DAY
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

/**
 * Invitations into the application and sign-up by invitation (`development/decisions/app-invitations-v1.md`), over
 * HTTP on the real production graph with a fake bot and a fresh `:memory:` database per test. Registration is closed
 * (`TELEGRAM_REGISTRATION_ENABLED=false`) unless a test says otherwise; the platform administrator is `stark`, the
 * owner of «Семья». Бот and browser are driven as in `telegram-sign-in-http.test.ts`.
 */

const ORIGIN = 'http://localhost:5173';
const WEBHOOK_SECRET = 'app-invitation-webhook-secret-012345';
const BOT_USERNAME = 'i_finances_test_bot';
const SESSION_COOKIE = 'i_finances_session';
const ADMIN = 'stark';
const MEMBER = 'anna-member';
const FAMILY = 'family';
const DAY = 24 * 60 * 60 * 1000;
const MARIA = { first_name: 'Мария', id: 3001, is_bot: false, username: 'maria_tg' };
const PETR = { first_name: 'Пётр', id: 3002, is_bot: false };
const OLGA = { first_name: 'Ольга', id: 3003, is_bot: false };
const TOKEN_LINK = new RegExp(`^${ORIGIN}/invite#([A-Za-z0-9_-]{43})$`, 'u');
const UNKNOWN_TOKEN = 'q'.repeat(43);
const CONFIRMED_TEXT = 'Вход подтверждён. Вернитесь в i-finances.';
const NOT_FOUND_TEXT = /^Аккаунт i-finances для этого Telegram не найден/u;

type TelegramPerson = { first_name: string; id: number; is_bot: boolean; username?: string };

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
	vi.stubEnv('TRUSTED_PROXY_COUNT', '0');
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
	vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:app-invitation-test-token');
	vi.stubEnv('TELEGRAM_BOT_USERNAME', BOT_USERNAME);
	vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', WEBHOOK_SECRET);
	vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'false');
	vi.stubEnv('PLATFORM_ADMIN_USERNAMES', ` ${ADMIN.toUpperCase()} , `);
	vi.stubEnv('APP_INVITATION_TTL_HOURS', '');
	vi.stubEnv('DEV_TELEGRAM_LOGIN', '');
	vi.stubEnv('NODE_ENV', 'test');
	await seed();
});

afterEach(() => {
	connection.close();
});

async function seed(): Promise<void> {
	const at = new Date(Date.now() - DAY);

	await database.insert(users).values([
		{ createdAt: at, displayName: 'Сергей', id: ADMIN, isActive: true, passwordHash: null, updatedAt: at, username: ADMIN },
		// The member calls herself by the administrator's login: that must not make her one.
		{ createdAt: at, displayName: ADMIN, id: MEMBER, isActive: true, passwordHash: null, updatedAt: at, username: MEMBER }
	]);
	await database.insert(households).values({ baseCurrency: 'BYN', createdAt: at, id: FAMILY, name: 'Семья', updatedAt: at });
	await database.insert(householdMembers).values([
		{ householdId: FAMILY, joinedAt: at, role: 'owner', userId: ADMIN },
		{ householdId: FAMILY, joinedAt: at, role: 'member', userId: MEMBER }
	]);
	await database.insert(sessions).values([ADMIN, MEMBER].map((userId) => ({
		createdAt: at,
		expiresAt: new Date(Date.now() + DAY),
		id: `${userId}-session`,
		lastSeenAt: at,
		tokenHash: hashSessionToken(sessionTokenOf(userId)),
		userId
	})));
}

function sessionTokenOf(userId: string): string {
	return `${userId}-session-token-0123456789abcdef`;
}

function boot(): Harness {
	const bot = new FakeTelegramBotClient();

	return { app: createApp(toAppDependencies(createDependencies(database, { telegramBotClient: bot }))), bot };
}

/** A browser: keeps the cookies the server sets and sends them back. */
class Browser {
	public readonly cookies = new Map<string, string>();

	public constructor(private readonly harness: Harness, signedInAs?: string) {
		if (signedInAs !== undefined) {
			this.cookies.set(SESSION_COOKIE, sessionTokenOf(signedInAs));
		}
	}

	public async request(
		method: string,
		path: string,
		body?: unknown,
		extraHeaders: Record<string, string> = {}
	): Promise<{ body: unknown; response: Response; text: string }> {
		const cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
		const response = await this.harness.app.request(path, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: {
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
				...(cookie === '' ? {} : { cookie }),
				origin: ORIGIN,
				...extraHeaders
			},
			method
		});

		this.adopt(response);

		const text = await response.text();

		return { body: text === '' ? undefined : JSON.parse(text) as unknown, response, text };
	}

	public post(path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
		return this.request('POST', path, body, extraHeaders);
	}

	public async start(invitationToken?: string): Promise<string> {
		const startBody = invitationToken === undefined ? undefined : { invitationToken };
		const { body, response } = await this.post('/api/auth/telegram/start', startBody);

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

async function deliver(harness: Harness, update: Omit<TelegramUpdate, 'update_id'>): Promise<void> {
	await harness.app.request('/api/telegram/webhook', {
		body: JSON.stringify({ ...update, update_id: nextUpdateId++ }),
		headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
		method: 'POST'
	});
}

/** `/start <code>` in the bot, then «Войти». */
async function confirmInBot(harness: Harness, code: string, from: TelegramPerson): Promise<void> {
	const chat = { id: from.id, type: 'private' as const };

	await deliver(harness, { message: { chat, date: 1_760_000_000, from, message_id: 50, text: `/start ${code}` } });

	const confirm = harness.bot.callsTo('sendMessage').at(-1)?.input.keyboard?.[0]?.[0]?.callbackData;

	if (confirm === undefined) {
		throw new Error('The bot sent no confirmation buttons.');
	}

	await deliver(harness, {
		callback_query: { data: confirm, from, id: `cb-${nextUpdateId}`, message: { chat, message_id: 77 } }
	});
}

function lastBotText(harness: Harness): string | undefined {
	return harness.bot.callsTo('editMessageText').at(-1)?.input.text;
}

async function createAppInvitation(harness: Harness, note?: string): Promise<{ id: string; token: string }> {
	const { body, response } = await new Browser(harness, ADMIN).post('/api/app-invitations', note === undefined ? undefined : { note });
	const parsed = createAppInvitationResultSchema.parse(body);

	expect(response.status, JSON.stringify(body)).toBe(201);

	if (!parsed.ok) {
		throw new Error('not created');
	}

	const token = TOKEN_LINK.exec(parsed.invitation.link)?.[1];

	expect(token, parsed.invitation.link).toBeDefined();

	return { id: parsed.invitation.id, token: token as string };
}

async function createHouseholdInvitation(harness: Harness): Promise<{ id: string; token: string }> {
	const { body, response } = await new Browser(harness, ADMIN).post('/api/household/invitations');

	expect(response.status, JSON.stringify(body)).toBe(201);

	const { invitation } = body as { invitation: { id: string; link: string } };

	return { id: invitation.id, token: TOKEN_LINK.exec(invitation.link)?.[1] as string };
}

function appInvitationRow(id: string) {
	return database.select().from(appInvitations).where(eq(appInvitations.id, id)).get();
}

function householdInvitationRow(id: string) {
	return database.select().from(householdInvitations).where(eq(householdInvitations.id, id)).get();
}

function userOfTelegram(person: TelegramPerson) {
	return database.select().from(users).where(eq(users.username, `tg-${person.id}`)).get();
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/** Every row of every table, serialized: for «the token is nowhere» and «nothing changed». */
function everything(): string {
	const tables = connection.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\'')
		.all() as Array<{ name: string }>;

	return JSON.stringify(tables.map(({ name }) => [name, connection.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
}

describe('sign-up with an invitation into the application, registration closed', () => {
	it('the whole path: invitation → start → bot → complete creates the user and consumes it → own household as owner', async () => {
		const harness = boot();
		const { id, token } = await createAppInvitation(harness, 'Для Марии');
		const guest = new Browser(harness);

		// The guest sees who invites, and that it is the application, nothing more.
		const previewed = await guest.post('/api/invitations/preview', { token });

		expect(previewed.response.status).toBe(200);
		expect(invitationPreviewResultSchema.parse(previewed.body)).toEqual({
			invitation: { expiresAt: new Date(appInvitationRow(id)?.expiresAt ?? 0).toISOString(), inviterName: 'Сергей', kind: 'app' },
			ok: true
		});
		expect(Object.keys((previewed.body as { invitation: object }).invitation).sort()).toEqual(['expiresAt', 'inviterName', 'kind']);
		expect(previewed.text).not.toMatch(/Семья|Для Марии|stark/u);

		const code = await guest.start(token);

		// Only the hash is bound to the request.
		expect(database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, code)).get()?.invitationTokenHash)
			.toBe(sha256(token));

		await confirmInBot(harness, code, MARIA);

		expect(lastBotText(harness)).toBe(CONFIRMED_TEXT);

		const done = await guest.complete(code);

		expect(done.response.status, done.text).toBe(200);
		expect(done.body).toEqual({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });

		const maria = userOfTelegram(MARIA);

		expect(maria).toMatchObject({ displayName: 'Мария', passwordHash: null });
		expect(appInvitationRow(id)).toMatchObject({ acceptedAt: expect.any(Date), acceptedByUserId: maria?.id, revokedAt: null });

		// Onboarding: no household, not an administrator; then her own household, as its owner.
		expect((await guest.request('GET', '/api/auth/session')).body).toMatchObject({ household: null, isPlatformAdmin: false });

		const created = await guest.post('/api/household', { name: 'Дом Марии' });

		expect(created.response.status, created.text).toBe(201);
		expect(created.body).toMatchObject({ household: { name: 'Дом Марии', role: 'owner' } });
		expect((await guest.request('GET', '/api/auth/session')).body).toMatchObject({ household: { name: 'Дом Марии', role: 'owner' } });
		expect(await database.select().from(householdMembers).where(eq(householdMembers.householdId, FAMILY))).toHaveLength(2);

		// The administrator sees it among the recently accepted, with the name and Telegram username.
		const listed = appInvitationsResultSchema.parse((await new Browser(harness, ADMIN).request('GET', '/api/app-invitations')).body);

		expect(listed).toEqual({
			invitations: [{
				acceptedAt: expect.any(String),
				acceptedBy: { displayName: 'Мария', telegramUsername: 'maria_tg' },
				createdAt: expect.any(String),
				expiresAt: expect.any(String),
				id,
				note: 'Для Марии',
				status: 'accepted'
			}],
			ok: true
		});

		// A second person with the same link: the request is an ordinary sign-in, the bot and the browser say «not found».
		const second = new Browser(harness);
		const secondCode = await second.start(token);

		expect(database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, secondCode)).get()?.invitationTokenHash)
			.toBeNull();

		await confirmInBot(harness, secondCode, PETR);

		expect(lastBotText(harness)).toMatch(NOT_FOUND_TEXT);

		const refused = await second.complete(secondCode);

		expect(refused.response.status).toBe(403);
		expect(refused.body).toMatchObject({ errorCode: 'registration-closed', ok: false });
		expect(userOfTelegram(PETR)).toBeUndefined();
	});

	it('two sign-ups racing with one link: exactly one account is created', async () => {
		const harness = boot();
		const { id, token } = await createAppInvitation(harness);
		const first = new Browser(harness);
		const second = new Browser(harness);
		const firstCode = await first.start(token);
		const secondCode = await second.start(token);

		// Both requests were started while the invitation was active: both carry its hash.
		await confirmInBot(harness, firstCode, MARIA);
		await confirmInBot(harness, secondCode, PETR);

		const answers = await Promise.all([first.complete(firstCode), second.complete(secondCode)]);

		expect(answers.map((answer) => answer.response.status).sort()).toEqual([200, 403]);
		expect(answers.map((answer) => (answer.body as { errorCode?: string }).errorCode).filter(Boolean)).toEqual(['registration-closed']);
		expect([userOfTelegram(MARIA), userOfTelegram(PETR)].filter((user) => user !== undefined)).toHaveLength(1);
		expect(await database.select().from(telegramAccounts)).toHaveLength(1);
		expect(appInvitationRow(id)?.acceptedByUserId).toBe((userOfTelegram(MARIA) ?? userOfTelegram(PETR))?.id);
	});

	it('the invitation is spent in the transaction that creates the user: if it is taken meanwhile, no user stays', async () => {
		const harness = boot();
		const { id, token } = await createAppInvitation(harness);
		const guest = new Browser(harness);
		const code = await guest.start(token);

		await confirmInBot(harness, code, MARIA);
		// Another sign-up takes the invitation right after this one has inserted its user, inside its transaction.
		connection.exec(`CREATE TEMP TRIGGER steal_invitation AFTER INSERT ON telegram_accounts BEGIN
			UPDATE app_invitations SET accepted_at = 1, accepted_by_user_id = '${MEMBER}' WHERE id = '${id}';
		END`);

		const answer = await guest.complete(code);

		expect(answer.response.status).toBe(403);
		expect(answer.body).toMatchObject({ errorCode: 'registration-closed' });
		expect(userOfTelegram(MARIA)).toBeUndefined();
		expect(await database.select().from(telegramAccounts)).toEqual([]);
		expect(await database.select().from(sessions).where(eq(sessions.userId, MEMBER))).toHaveLength(1);
		// The whole transaction went back, the simulated competitor's change with it (it ran inside it).
		expect(appInvitationRow(id)).toMatchObject({ acceptedAt: null, acceptedByUserId: null });
	});

	it('expired or revoked between start and complete: refused like no invitation, nothing created or consumed', async () => {
		for (const ending of ['expire', 'revoke'] as const) {
			const harness = boot();
			const { id, token } = await createAppInvitation(harness);
			const guest = new Browser(harness);
			const code = await guest.start(token);
			const person = ending === 'expire' ? MARIA : PETR;

			await confirmInBot(harness, code, person);

			if (ending === 'expire') {
				database.update(appInvitations).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(appInvitations.id, id)).run();
			}
			else {
				expect((await new Browser(harness, ADMIN).post(`/api/app-invitations/${id}/revoke`)).response.status).toBe(200);
			}

			const answer = await guest.complete(code);

			expect(answer.response.status, ending).toBe(403);
			expect(answer.body, ending).toMatchObject({ errorCode: 'registration-closed' });
			expect(userOfTelegram(person), ending).toBeUndefined();
			expect(appInvitationRow(id)?.acceptedAt, ending).toBeNull();
		}
	});

	it('an existing user signs in with the link as usual and does not spend it', async () => {
		const at = new Date();

		await database.insert(telegramAccounts).values({
			chatId: String(OLGA.id), firstName: 'Ольга', lastName: null, lastSignInAt: at, linkedAt: at, telegramId: String(OLGA.id),
			updatedAt: at, userId: MEMBER, username: null
		});

		const harness = boot();
		const { id, token } = await createAppInvitation(harness);
		const browser = new Browser(harness);
		const code = await browser.start(token);

		await confirmInBot(harness, code, OLGA);

		const answer = await browser.complete(code);

		expect(answer.body).toEqual({ hasHousehold: true, isNewUser: false, ok: true, status: 'confirmed' });
		expect(appInvitationRow(id)).toMatchObject({ acceptedAt: null, acceptedByUserId: null });
		expect(await database.select().from(users)).toHaveLength(2);
	});

	it('without an invitation nothing changed: an unknown Telegram is refused, and an unknown token is the same as none', async () => {
		const harness = boot();

		for (const token of [undefined, UNKNOWN_TOKEN]) {
			const browser = new Browser(harness);
			const code = await browser.start(token);

			expect(database.select().from(telegramLoginRequests).where(eq(telegramLoginRequests.code, code)).get()?.invitationTokenHash)
				.toBeNull();

			await confirmInBot(harness, code, MARIA);

			expect(lastBotText(harness)).toMatch(NOT_FOUND_TEXT);
			expect((await browser.complete(code)).body).toMatchObject({ errorCode: 'registration-closed' });
		}

		expect(userOfTelegram(MARIA)).toBeUndefined();
	});

	it('with registration open the link is still spent, and a spent link does not stop the sign-up', async () => {
		vi.stubEnv('TELEGRAM_REGISTRATION_ENABLED', 'true');

		const harness = boot();
		const { id, token } = await createAppInvitation(harness);
		const first = new Browser(harness);
		const code = await first.start(token);

		await confirmInBot(harness, code, MARIA);

		expect((await first.complete(code)).body).toMatchObject({ isNewUser: true, status: 'confirmed' });
		expect(appInvitationRow(id)?.acceptedByUserId).toBe(userOfTelegram(MARIA)?.id);

		const second = new Browser(harness);
		const secondCode = await second.start(token);

		await confirmInBot(harness, secondCode, PETR);

		expect((await second.complete(secondCode)).body).toMatchObject({ isNewUser: true, status: 'confirmed' });
	});
});

describe('sign-up with a household invitation, registration closed', () => {
	it('registers the person without spending the invitation; they join through accept; one sign-up per link', async () => {
		const harness = boot();
		const { id, token } = await createHouseholdInvitation(harness);
		const guest = new Browser(harness);
		const code = await guest.start(token);

		await confirmInBot(harness, code, MARIA);

		expect(lastBotText(harness)).toBe(CONFIRMED_TEXT);
		expect((await guest.complete(code)).body).toEqual({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });

		const maria = userOfTelegram(MARIA);

		// Not consumed: still active, only its sign-up is taken.
		expect(householdInvitationRow(id)).toMatchObject({ acceptedAt: null, registeredUserId: maria?.id, revokedAt: null });
		expect((await guest.post('/api/invitations/preview', { token })).body)
			.toMatchObject({ invitation: { householdName: 'Семья', kind: 'household' } });

		// A second new person with the same household link cannot sign up.
		const other = new Browser(harness);
		const otherCode = await other.start(token);

		await confirmInBot(harness, otherCode, PETR);

		expect(lastBotText(harness)).toMatch(NOT_FOUND_TEXT);
		expect((await other.complete(otherCode)).body).toMatchObject({ errorCode: 'registration-closed' });
		expect(userOfTelegram(PETR)).toBeUndefined();

		// Joining is the ordinary acceptance.
		const accepted = await guest.post('/api/invitations/accept', { token });

		expect(accepted.response.status, accepted.text).toBe(200);
		expect(accepted.body).toEqual({ household: { id: FAMILY, name: 'Семья', role: 'member' }, ok: true });
		expect(householdInvitationRow(id)).toMatchObject({ acceptedAt: expect.any(Date), acceptedByUserId: maria?.id });
	});

	it('a household invitation that is no longer active registers nobody', async () => {
		const harness = boot();
		const { id, token } = await createHouseholdInvitation(harness);
		const guest = new Browser(harness);
		const code = await guest.start(token);

		await confirmInBot(harness, code, MARIA);
		expect((await new Browser(harness, ADMIN).post(`/api/household/invitations/${id}/revoke`)).response.status).toBe(200);

		expect((await guest.complete(code)).body).toMatchObject({ errorCode: 'registration-closed' });
		expect(userOfTelegram(MARIA)).toBeUndefined();
		expect(householdInvitationRow(id)?.registeredUserId).toBeNull();
	});
});

describe('start with an invitation token', () => {
	it('refuses a malformed token and a body that is not JSON; an empty body is an ordinary start', async () => {
		const harness = boot();
		const browser = new Browser(harness);

		for (const body of [{ invitationToken: 'short' }, { invitationToken: 42 }]) {
			const answer = await browser.post('/api/auth/telegram/start', body);

			expect(answer.response.status, JSON.stringify(body)).toBe(400);
			expect(answer.body).toMatchObject({ errorCode: 'invalid-input', ok: false });
		}

		const notJson = await harness.app.request('/api/auth/telegram/start', {
			body: '{"invitationToken":',
			headers: { 'content-type': 'application/json', origin: ORIGIN },
			method: 'POST'
		});

		expect(notJson.status).toBe(400);
		expect(await database.select().from(telegramLoginRequests)).toEqual([]);
		expect((await browser.post('/api/auth/telegram/start')).response.status).toBe(200);
	});

	it('answers the same for a live, a dead and an unknown token, and keeps the hash only', async () => {
		const harness = boot();
		const live = await createAppInvitation(harness);
		const dead = await createAppInvitation(harness);

		await new Browser(harness, ADMIN).post(`/api/app-invitations/${dead.id}/revoke`);

		const shapes = new Set<string>();

		for (const token of [live.token, dead.token, UNKNOWN_TOKEN]) {
			const answer = await new Browser(harness).post('/api/auth/telegram/start', { invitationToken: token });
			const { code: _code, expiresAt: _expiresAt, ...rest } = answer.body as Record<string, unknown>;

			expect(answer.response.status).toBe(200);
			shapes.add(JSON.stringify({ ...rest, appUrl: undefined, botUrl: undefined, keys: Object.keys(answer.body as object).sort() }));
		}

		expect(shapes.size).toBe(1);

		const bound = (await database.select().from(telegramLoginRequests)).map((row) => row.invitationTokenHash);

		expect(bound).toEqual([sha256(live.token), null, null]);
		expect(everything()).not.toContain(live.token);
		expect(everything()).not.toContain(dead.token);
	});
});

describe('preview and accept of an invitation into the application', () => {
	it('a dead link tells only its reason, in the same shape as a household one; the work is the same for every cause', async () => {
		const harness = boot();
		const expired = await createAppInvitation(harness);
		const revoked = await createAppInvitation(harness);
		const used = await createAppInvitation(harness);
		const household = await createHouseholdInvitation(harness);

		database.update(appInvitations).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(appInvitations.id, expired.id)).run();
		await new Browser(harness, ADMIN).post(`/api/app-invitations/${revoked.id}/revoke`);
		database.update(appInvitations)
			.set({ acceptedAt: new Date(), acceptedByUserId: MEMBER })
			.where(eq(appInvitations.id, used.id))
			.run();
		await new Browser(harness, ADMIN).post(`/api/household/invitations/${household.id}/revoke`);

		const prepare = vi.spyOn(connection, 'prepare');
		const cases: Array<[string, string]> = [
			['unknown', UNKNOWN_TOKEN],
			['expired', expired.token],
			['revoked', revoked.token],
			['used', used.token],
			['revoked', household.token]
		];
		const answers: Array<{ reason: string; statements: number; text: string }> = [];

		for (const [reason, token] of cases) {
			prepare.mockClear();

			const answer = await new Browser(harness).post('/api/invitations/preview', { token });

			expect(answer.response.status, reason).toBe(404);
			expect(answer.body, reason).toMatchObject({ errorCode: 'invitation-unavailable', ok: false, reason });
			answers.push({ reason, statements: prepare.mock.calls.length, text: answer.text });
		}

		prepare.mockRestore();

		const withoutReason = answers.map(({ text }) => {
			const { reason: _reason, ...rest } = JSON.parse(text) as Record<string, unknown>;

			return JSON.stringify(rest);
		});

		expect(new Set(withoutReason).size).toBe(1);
		expect(new Set(answers.map(({ statements }) => statements)).size, answers.map(({ statements }) => statements).join()).toBe(1);
		expect(answers.map(({ text }) => text).join()).not.toMatch(/Сергей|Семья/u);
	});

	it('accept of a live invitation into the application is refused and changes nothing; a dead one tells its reason', async () => {
		const harness = boot();
		const live = await createAppInvitation(harness);
		const dead = await createAppInvitation(harness);

		await new Browser(harness, ADMIN).post(`/api/app-invitations/${dead.id}/revoke`);

		const before = everything();
		const member = new Browser(harness, MEMBER);
		const refused = await member.post('/api/invitations/accept', { replaceEmptyHousehold: true, token: live.token });

		expect(refused.response.status).toBe(409);
		expect(refused.body).toMatchObject({ errorCode: 'app-invitation-not-acceptable', ok: false });
		expect(refused.body).not.toHaveProperty('reason');

		const deadAnswer = await member.post('/api/invitations/accept', { token: dead.token });

		expect(deadAnswer.response.status).toBe(404);
		expect(deadAnswer.body).toMatchObject({ errorCode: 'invitation-unavailable', reason: 'revoked' });
		// Only the session's last-seen time may move.
		expect(everything().replace(/"last_seen_at":\d+/gu, '')).toBe(before.replace(/"last_seen_at":\d+/gu, ''));
	});
});

describe('managing invitations into the application', () => {
	it('creates with a note, shows the link once, keeps only the hash, lives 7 days by default', async () => {
		const harness = boot();
		const startedAt = Date.now();
		const { id, token } = await createAppInvitation(harness, '  Для Марии  ');
		const row = appInvitationRow(id);

		expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		expect(row).toMatchObject({
			acceptedAt: null,
			createdByUserId: ADMIN,
			note: 'Для Марии',
			revokedAt: null,
			tokenHash: sha256(token)
		});
		expect((row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0)).toBe(7 * DAY);
		expect(row?.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt);
		expect(everything()).not.toContain(token);

		const listed = await new Browser(harness, ADMIN).request('GET', '/api/app-invitations');

		expect(listed.body).toEqual({
			invitations: [{
				acceptedAt: null,
				acceptedBy: null,
				createdAt: row?.createdAt.toISOString(),
				expiresAt: row?.expiresAt.toISOString(),
				id,
				note: 'Для Марии',
				status: 'active'
			}],
			ok: true
		});
		expect(listed.text).not.toContain(token);
		expect(listed.text).not.toContain(sha256(token));
	});

	it('an empty note is none; a long note or one with control characters is refused', async () => {
		const harness = boot();
		const admin = new Browser(harness, ADMIN);
		const { id } = await createAppInvitation(harness, '   ');

		expect(appInvitationRow(id)?.note).toBeNull();
		expect((await admin.post('/api/app-invitations', {})).response.status).toBe(201);
		expect((await admin.post('/api/app-invitations', { note: 'я'.repeat(80) })).response.status).toBe(201);

		for (const note of ['я'.repeat(81), 'строка\nвторая', 'тихо​тихо', 7]) {
			const answer = await admin.post('/api/app-invitations', { note });

			expect(answer.response.status, String(note)).toBe(400);
			expect(answer.body).toMatchObject({ errorCode: 'invalid-input', fieldErrors: { note: expect.any(String) }, ok: false });
		}

		const notJson = await admin.request('POST', '/api/app-invitations', undefined, { 'content-type': 'application/json' });

		expect(notJson.response.status).toBe(201);
		expect(await database.select().from(appInvitations)).toHaveLength(4);
	});

	it('revokes an active invitation once; unknown and spent ones are not found', async () => {
		const harness = boot();
		const admin = new Browser(harness, ADMIN);
		const { id, token } = await createAppInvitation(harness);

		expect((await admin.post(`/api/app-invitations/${id}/revoke`)).body).toEqual({ ok: true });
		expect(appInvitationRow(id)?.revokedAt).toBeInstanceOf(Date);

		for (const target of [id, 'no-such-invitation']) {
			const again = await admin.post(`/api/app-invitations/${target}/revoke`);

			expect(again.response.status).toBe(404);
			expect(again.body).toMatchObject({ errorCode: 'invitation-not-found', ok: false });
		}

		expect((await new Browser(harness).post('/api/invitations/preview', { token })).body).toMatchObject({ reason: 'revoked' });
		// A revoked one is not listed.
		expect((await admin.request('GET', '/api/app-invitations')).body).toEqual({ invitations: [], ok: true });
	});

	it(`allows at most ${MAX_ACTIVE_APP_INVITATIONS} active and ${MAX_APP_INVITATIONS_PER_DAY} a day`, async () => {
		const harness = boot();
		const admin = new Browser(harness, ADMIN);
		const created: string[] = [];

		for (let index = 0; index < MAX_ACTIVE_APP_INVITATIONS; index += 1) {
			created.push((await createAppInvitation(harness)).id);
		}

		const full = await admin.post('/api/app-invitations');

		expect(full.response.status).toBe(409);
		expect(full.body).toMatchObject({ errorCode: 'invitation-limit-reached' });

		// Revoked ones free a place, but still count for the day.
		for (const id of created) {
			await admin.post(`/api/app-invitations/${id}/revoke`);
		}

		for (let index = MAX_ACTIVE_APP_INVITATIONS; index < MAX_APP_INVITATIONS_PER_DAY; index += 1) {
			const { id } = await createAppInvitation(harness);

			await admin.post(`/api/app-invitations/${id}/revoke`);
		}

		const daily = await admin.post('/api/app-invitations');

		expect(daily.response.status).toBe(429);
		expect(daily.body).toMatchObject({ errorCode: 'rate-limited' });
		expect(await database.select().from(appInvitations)).toHaveLength(MAX_APP_INVITATIONS_PER_DAY);
	});

	it('a mutation from another origin is refused for the administrator too', async () => {
		const harness = boot();
		const answer = await new Browser(harness, ADMIN).post('/api/app-invitations', {}, { origin: 'https://evil.example' });

		expect(answer.response.status).toBe(403);
		expect(answer.body).toMatchObject({ errorCode: 'invalid-origin' });
		expect(await database.select().from(appInvitations)).toEqual([]);
	});

	it('without a session, and with the MCP key of the administrator, the answer is 401', async () => {
		vi.stubEnv('MCP_API_KEY', 'k'.repeat(48));
		vi.stubEnv('MCP_USER_ID', ADMIN);

		const harness = boot();

		const variants: Array<Record<string, string>> = [{}, { authorization: `Bearer ${'k'.repeat(48)}` }];

		for (const headers of variants) {
			const answer = await new Browser(harness).post('/api/app-invitations', {}, headers);

			expect(answer.response.status).toBe(401);
			expect(answer.body).toMatchObject({ errorCode: 'unauthenticated' });
		}

		expect(await database.select().from(appInvitations)).toEqual([]);
	});

	it('nobody is an administrator when PLATFORM_ADMIN_USERNAMES is empty', async () => {
		vi.stubEnv('PLATFORM_ADMIN_USERNAMES', '');

		const harness = boot();
		const missing = await new Browser(harness, ADMIN).post('/api/no-such-route', {});
		const answer = await new Browser(harness, ADMIN).post('/api/app-invitations', {});

		expect(`${answer.response.status} ${answer.text}`).toBe(`${missing.response.status} ${missing.text}`);
		expect((await new Browser(harness, ADMIN).request('GET', '/api/auth/session')).body).toMatchObject({ isPlatformAdmin: false });
	});

	it('the administrator is told by the login, not by the display name', async () => {
		const harness = boot();
		const member = new Browser(harness, MEMBER);

		expect((await member.request('GET', '/api/auth/session')).body)
			.toMatchObject({ isPlatformAdmin: false, user: { displayName: ADMIN } });
		expect((await member.post('/api/app-invitations', {})).response.status).toBe(404);
		expect((await new Browser(harness, ADMIN).request('GET', '/api/auth/session')).body).toMatchObject({ isPlatformAdmin: true });
	});
});

describe('configuration', () => {
	it('APP_INVITATION_TTL_HOURS defaults to 7 days and accepts whole hours from 1 to 168 only', () => {
		expect(getAppInvitationConfig({}).ttlMilliseconds).toBe(7 * DAY);
		expect(getAppInvitationConfig({ APP_INVITATION_TTL_HOURS: ' ' }).ttlMilliseconds).toBe(7 * DAY);
		expect(getAppInvitationConfig({ APP_INVITATION_TTL_HOURS: '1' }).ttlMilliseconds).toBe(60 * 60 * 1000);
		expect(getAppInvitationConfig({ APP_INVITATION_TTL_HOURS: '168' }).ttlMilliseconds).toBe(7 * DAY);

		for (const value of ['0', '169', '1.5', '-1', 'week']) {
			expect(() => getAppInvitationConfig({ APP_INVITATION_TTL_HOURS: value }), value).toThrow(/APP_INVITATION_TTL_HOURS/);
		}
	});

	it('APP_INVITATION_TTL_HOURS sets the lifetime of a new invitation', async () => {
		vi.stubEnv('APP_INVITATION_TTL_HOURS', '2');

		const { id } = await createAppInvitation(boot());
		const row = appInvitationRow(id);

		expect((row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0)).toBe(2 * 60 * 60 * 1000);
	});

	it('PLATFORM_ADMIN_USERNAMES: logins separated by commas, normalized; nothing means nobody; garbage stops the start', () => {
		expect([...parsePlatformAdminUsernames(undefined)]).toEqual([]);
		expect([...parsePlatformAdminUsernames(' , ')]).toEqual([]);
		expect([...parsePlatformAdminUsernames(' Stark ,olga.k,, ')]).toEqual(['stark', 'olga.k']);

		for (const value of ['stark;olga', 'st', 'stark olga']) {
			expect(() => parsePlatformAdminUsernames(value), value).toThrow(/PLATFORM_ADMIN_USERNAMES/);
		}

		vi.stubEnv('PLATFORM_ADMIN_USERNAMES', 'stark olga');
		expect(() => createDependencies(database, { telegramBotClient: new FakeTelegramBotClient() })).toThrow(/PLATFORM_ADMIN_USERNAMES/);
	});
});
