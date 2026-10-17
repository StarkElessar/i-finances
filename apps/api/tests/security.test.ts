import { createApiApp } from '@/app';
import { SecurityHttpController } from '@/http/security-controller';
import { CookieSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	householdMembers,
	households,
	sessions,
	users,
	webauthnCredentials
} from '@/infrastructure/database/schema';
import type { AuthConfig } from '@/modules/auth';
import {
	LoginRateLimiter,
	PasswordService,
	PasswordUserRepository,
	SecurityService,
	SessionRepository,
	SessionService,
	WebAuthnCredentialRepository
} from '@/modules/auth';

import {
	changePasswordResultSchema,
	deleteSecurityPasskeyResultSchema,
	revokeOtherSecuritySessionsResultSchema,
	revokeSecuritySessionResultSchema,
	securityPasskeysResultSchema,
	securitySessionsResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');
const AUTH_CONFIG: AuthConfig = {
	origin: 'http://localhost:5173',
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: 30 * 24 * 60 * 60 * 1000,
	trustedProxyCount: 0,
	webauthnRpId: 'localhost',
	webauthnRpName: 'iFinances'
};
const OLD_PASSWORD = 'old-password-123';
const NEW_PASSWORD = 'new-password-456';
const PLACEHOLDER_HASH = 'passkey-only-placeholder';
const CHROME_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
	+ '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_ON_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
	+ '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const passwordService = new PasswordService();
let oldPasswordHash: string;
let connection: Database.Database;
let database: AppDatabase;
let nextSessionId: number;
let nextToken: number;

beforeAll(async () => {
	oldPasswordHash = await passwordService.hash(OLD_PASSWORD);
});

beforeEach(async () => {
	nextSessionId = 0;
	nextToken = 0;
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	// Two users in two different environments (households).
	for (const [index, id] of ['alice', 'bob'].entries()) {
		await database.insert(users).values({
			createdAt: FIXED_DATE,
			displayName: id,
			id,
			isActive: true,
			passwordHash: oldPasswordHash,
			updatedAt: FIXED_DATE,
			username: id
		});
		await database.insert(households).values({
			baseCurrency: 'BYN',
			createdAt: FIXED_DATE,
			id: `household-${index}`,
			name: `Семья ${id}`,
			updatedAt: FIXED_DATE
		});
		await database.insert(householdMembers).values({
			householdId: `household-${index}`,
			joinedAt: FIXED_DATE,
			role: 'owner',
			userId: id
		});
	}
});

afterEach(() => {
	connection.close();
});

function createContext(options: { rateLimiter?: LoginRateLimiter } = {}) {
	const sessionService = new SessionService(new SessionRepository(database), {
		config: AUTH_CONFIG,
		createId: () => `session-${++nextSessionId}`,
		createToken: () => `token-${++nextToken}`,
		now: () => FIXED_DATE
	});
	const securityService = new SecurityService({
		credentialRepository: new WebAuthnCredentialRepository(database),
		now: () => FIXED_DATE,
		passwordService,
		rateLimiter: options.rateLimiter ?? new LoginRateLimiter(),
		sessionRepository: new SessionRepository(database),
		userRepository: new PasswordUserRepository(database)
	});
	const app = createApiApp({
		securityController: new SecurityHttpController(
			securityService,
			new CookieSessionResolver(sessionService, AUTH_CONFIG.sessionCookieName),
			AUTH_CONFIG
		)
	});

	return { app, sessionService };
}

/**
 * Signs the user in and returns the id of the stored session plus a request helper
 * that sends the matching cookie.
 */
async function signIn(
	sessionService: SessionService,
	app: ReturnType<typeof createApiApp>,
	userId: string,
	userAgent?: string
) {
	const { token } = await sessionService.createSession(userId, { ipAddress: '203.0.113.7', userAgent });
	const sessionId = `session-${nextSessionId}`;

	async function request(path: string, init: { body?: unknown; method?: string } = {}) {
		const method = init.method ?? 'GET';
		const response = await app.request(path, {
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			headers: {
				cookie: `${AUTH_CONFIG.sessionCookieName}=${token}`,
				...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: AUTH_CONFIG.origin })
			},
			method
		});

		return { body: await response.json() as unknown, status: response.status };
	}

	return { request, sessionId };
}

async function addPasskey(userId: string, id: string, deviceName: string | null = null): Promise<void> {
	await database.insert(webauthnCredentials).values({
		backedUp: false,
		counter: 0,
		createdAt: FIXED_DATE,
		deviceName,
		deviceType: 'singleDevice',
		id,
		publicKey: 'public-key-material',
		userId
	});
}

async function countPasskeys(userId: string): Promise<number> {
	return (await database.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId))).length;
}

async function listSessionIds(userId: string): Promise<string[]> {
	const rows = await database.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));

	return rows.map((row) => row.id).sort();
}

describe('security API authentication', () => {
	const routes: Array<[string, string]> = [
		['GET', '/api/security/passkeys'],
		['DELETE', '/api/security/passkeys/credential-1'],
		['POST', '/api/security/password'],
		['GET', '/api/security/sessions'],
		['DELETE', '/api/security/sessions/session-1'],
		['DELETE', '/api/security/sessions/others']
	];

	it.each(routes)('rejects %s %s without a session', async (method, path) => {
		const { app } = createContext();
		const response = await app.request(path, {
			body: method === 'POST' ? JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }) : undefined,
			headers: method === 'GET' ? {} : { 'content-type': 'application/json', origin: AUTH_CONFIG.origin },
			method
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ errorCode: 'unauthenticated', ok: false });
	});

	it('rejects cross-origin mutations even with a valid session', async () => {
		const { app, sessionService } = createContext();
		const { token } = await sessionService.createSession('alice');
		await addPasskey('alice', 'credential-1');
		await addPasskey('alice', 'credential-2');
		const response = await app.request('/api/security/passkeys/credential-1', {
			headers: { cookie: `${AUTH_CONFIG.sessionCookieName}=${token}`, origin: 'https://evil.example' },
			method: 'DELETE'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ errorCode: 'invalid-origin', ok: false });
		expect(await countPasskeys('alice')).toBe(2);
	});
});

describe('passkeys', () => {
	it('lists only the caller\'s keys without key material', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'alice-key', 'MacBook');
		await addPasskey('bob', 'bob-key', 'Pixel');

		const { body, status } = await alice.request('/api/security/passkeys');

		expect(status).toBe(200);
		expect(securityPasskeysResultSchema.parse(body)).toEqual({
			ok: true,
			passkeys: [{
				createdAt: FIXED_DATE.toISOString(),
				deviceName: 'MacBook',
				id: 'alice-key',
				lastUsedAt: null
			}]
		});
		expect(JSON.stringify(body)).not.toContain('public-key-material');
	});

	it('deletes one of several keys', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'key-1');
		await addPasskey('alice', 'key-2');

		const { body, status } = await alice.request('/api/security/passkeys/key-1', { method: 'DELETE' });

		expect(status).toBe(200);
		expect(deleteSecurityPasskeyResultSchema.parse(body)).toEqual({ ok: true });
		expect(await countPasskeys('alice')).toBe(1);
	});

	it('cannot delete another user\'s key and does not reveal it exists', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'alice-key');
		await addPasskey('bob', 'bob-key');
		await addPasskey('bob', 'bob-key-2');

		const foreign = await alice.request('/api/security/passkeys/bob-key', { method: 'DELETE' });
		const missing = await alice.request('/api/security/passkeys/no-such-key', { method: 'DELETE' });

		expect(foreign.status).toBe(404);
		expect(foreign.body).toEqual(missing.body);
		expect(foreign.body).toMatchObject({ errorCode: 'not-found', ok: false });
		expect(await countPasskeys('bob')).toBe(2);
		expect(await countPasskeys('alice')).toBe(1);
	});

	it('allows removing the last key when the account has a password', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'only-key');

		const { status } = await alice.request('/api/security/passkeys/only-key', { method: 'DELETE' });

		expect(status).toBe(200);
		expect(await countPasskeys('alice')).toBe(0);
	});

	it('refuses to remove the last key when the account has no password', async () => {
		await database.update(users).set({ passwordHash: PLACEHOLDER_HASH }).where(eq(users.id, 'alice'));
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'key-1');
		await addPasskey('alice', 'key-2');

		expect((await alice.request('/api/security/passkeys/key-1', { method: 'DELETE' })).status).toBe(200);

		const refused = await alice.request('/api/security/passkeys/key-2', { method: 'DELETE' });

		expect(refused.status).toBe(409);
		expect(refused.body).toMatchObject({ errorCode: 'last-passkey', ok: false });
		expect(await countPasskeys('alice')).toBe(1);
	});

	it('does not let another user\'s keys count towards the last-key rule', async () => {
		await database.update(users).set({ passwordHash: PLACEHOLDER_HASH }).where(eq(users.id, 'alice'));
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		await addPasskey('alice', 'alice-key');
		await addPasskey('bob', 'bob-key');
		await addPasskey('bob', 'bob-key-2');

		const refused = await alice.request('/api/security/passkeys/alice-key', { method: 'DELETE' });

		expect(refused.status).toBe(409);
		expect(await countPasskeys('alice')).toBe(1);
	});
});

describe('change password', () => {
	it('changes the password and ends every other session of the user, keeping the current one', async () => {
		const { app, sessionService } = createContext();
		const aliceLaptop = await signIn(sessionService, app, 'alice', CHROME_ON_MAC);
		const alicePhone = await signIn(sessionService, app, 'alice', SAFARI_ON_IPHONE);
		const bob = await signIn(sessionService, app, 'bob');

		const { body, status } = await aliceLaptop.request('/api/security/password', {
			body: { currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD },
			method: 'POST'
		});

		expect(status).toBe(200);
		expect(changePasswordResultSchema.parse(body)).toEqual({ ok: true, revokedSessionCount: 1 });
		expect(await listSessionIds('alice')).toEqual([aliceLaptop.sessionId]);
		expect(await listSessionIds('bob')).toEqual([bob.sessionId]);
		expect((await alicePhone.request('/api/security/sessions')).status).toBe(401);
		expect((await aliceLaptop.request('/api/security/sessions')).status).toBe(200);

		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));
		const [bobRow] = await database.select().from(users).where(eq(users.id, 'bob'));

		expect(await passwordService.verify(alice.passwordHash, NEW_PASSWORD)).toBe(true);
		expect(await passwordService.verify(alice.passwordHash, OLD_PASSWORD)).toBe(false);
		expect(bobRow.passwordHash).toBe(oldPasswordHash);
	});

	it('rejects a wrong current password and changes nothing', async () => {
		const { app, sessionService } = createContext();
		const aliceLaptop = await signIn(sessionService, app, 'alice');
		const alicePhone = await signIn(sessionService, app, 'alice');

		const { body, status } = await aliceLaptop.request('/api/security/password', {
			body: { currentPassword: 'definitely-wrong', newPassword: NEW_PASSWORD },
			method: 'POST'
		});

		expect(status).toBe(400);
		expect(changePasswordResultSchema.parse(body)).toMatchObject({
			errorCode: 'invalid-current-password',
			fieldErrors: { currentPassword: expect.any(String) },
			ok: false
		});
		expect(await listSessionIds('alice')).toEqual([aliceLaptop.sessionId, alicePhone.sessionId].sort());

		const [alice] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(alice.passwordHash).toBe(oldPasswordHash);
	});

	it('rejects a new password that is too short or equal to the current one', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		const tooShort = await alice.request('/api/security/password', {
			body: { currentPassword: OLD_PASSWORD, newPassword: 'short' },
			method: 'POST'
		});
		const unchanged = await alice.request('/api/security/password', {
			body: { currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD },
			method: 'POST'
		});
		const malformed = await alice.request('/api/security/password', { method: 'POST' });

		expect(tooShort.status).toBe(400);
		expect(tooShort.body).toMatchObject({ errorCode: 'invalid-input', fieldErrors: { newPassword: expect.any(String) } });
		expect(unchanged.status).toBe(400);
		expect(unchanged.body).toMatchObject({ errorCode: 'password-unchanged' });
		expect(malformed.status).toBe(400);
		expect(malformed.body).toMatchObject({ errorCode: 'invalid-input' });
	});

	it('locks further attempts after repeated wrong current passwords, even with the right one', async () => {
		const { app, sessionService } = createContext({ rateLimiter: new LoginRateLimiter({ maxAttempts: 2 }) });
		const alice = await signIn(sessionService, app, 'alice');
		const attempt = (currentPassword: string) => alice.request('/api/security/password', {
			body: { currentPassword, newPassword: NEW_PASSWORD },
			method: 'POST'
		});

		expect((await attempt('wrong-one-123456')).status).toBe(400);
		expect((await attempt('wrong-two-123456')).status).toBe(400);

		const blocked = await attempt(OLD_PASSWORD);

		expect(blocked.status).toBe(429);
		expect(blocked.body).toMatchObject({ errorCode: 'rate-limited' });

		const [row] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(row.passwordHash).toBe(oldPasswordHash);
	});

	it('resets the attempt counter after a successful change', async () => {
		const { app, sessionService } = createContext({ rateLimiter: new LoginRateLimiter({ maxAttempts: 2 }) });
		const alice = await signIn(sessionService, app, 'alice');
		const attempt = (currentPassword: string, newPassword: string) => alice.request('/api/security/password', {
			body: { currentPassword, newPassword },
			method: 'POST'
		});

		expect((await attempt('wrong-one-123456', NEW_PASSWORD)).status).toBe(400);
		expect((await attempt(OLD_PASSWORD, NEW_PASSWORD)).status).toBe(200);
		// Without the reset the counter would be at the limit and this would be 429.
		expect((await attempt(OLD_PASSWORD, 'another-password-789')).status).toBe(400);
		expect((await attempt('wrong-two-123456', 'another-password-789')).status).toBe(400);
	});

	it('limits parallel guesses: attempts are reserved before the slow verification', async () => {
		const { app, sessionService } = createContext({ rateLimiter: new LoginRateLimiter({ maxAttempts: 3 }) });
		const alice = await signIn(sessionService, app, 'alice');
		const results = await Promise.all(Array.from({ length: 12 }, (_, index) => alice.request('/api/security/password', {
			body: { currentPassword: `wrong-password-${index}`, newPassword: NEW_PASSWORD },
			method: 'POST'
		})));
		const statuses = results.map((result) => result.status);

		expect(statuses.filter((status) => status === 400)).toHaveLength(3);
		expect(statuses.filter((status) => status === 429)).toHaveLength(9);

		const [row] = await database.select().from(users).where(eq(users.id, 'alice'));

		expect(row.passwordHash).toBe(oldPasswordHash);
	});

	it('answers password-not-set without counting an attempt for an account without a password', async () => {
		await database.update(users).set({ passwordHash: PLACEHOLDER_HASH }).where(eq(users.id, 'alice'));
		const { app, sessionService } = createContext({ rateLimiter: new LoginRateLimiter({ maxAttempts: 1 }) });
		const alice = await signIn(sessionService, app, 'alice');
		const attempt = () => alice.request('/api/security/password', {
			body: { currentPassword: PLACEHOLDER_HASH, newPassword: NEW_PASSWORD },
			method: 'POST'
		});

		for (let index = 0; index < 3; index += 1) {
			const { body, status } = await attempt();

			expect(status).toBe(409);
			expect(body).toMatchObject({ errorCode: 'password-not-set', ok: false });
		}
	});

	it('rejects an oversized body before reading it', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		const { body, status } = await alice.request('/api/security/password', {
			body: { currentPassword: OLD_PASSWORD, newPassword: 'x'.repeat(8 * 1024) },
			method: 'POST'
		});

		expect(status).toBe(413);
		expect(body).toMatchObject({ errorCode: 'payload-too-large', ok: false });
	});

	it('does not read or validate the body of an unauthenticated request', async () => {
		const { app } = createContext();
		const response = await app.request('/api/security/password', {
			body: 'not json at all',
			headers: { 'content-type': 'application/json', origin: AUTH_CONFIG.origin },
			method: 'POST'
		});

		expect(response.status).toBe(401);
	});
});

describe('sessions', () => {
	it('lists the caller\'s active sessions, marks the current one and hides tokens', async () => {
		const { app, sessionService } = createContext();
		const aliceLaptop = await signIn(sessionService, app, 'alice', CHROME_ON_MAC);
		const alicePhone = await signIn(sessionService, app, 'alice', SAFARI_ON_IPHONE);
		await signIn(sessionService, app, 'bob', CHROME_ON_MAC);
		await database.insert(sessions).values({
			createdAt: new Date('2026-05-01T10:00:00.000Z'),
			expiresAt: new Date('2026-06-01T10:00:00.000Z'),
			id: 'expired-session',
			lastSeenAt: new Date('2026-05-01T10:00:00.000Z'),
			tokenHash: 'expired-token-hash',
			userId: 'alice'
		});

		const { body, status } = await alicePhone.request('/api/security/sessions');
		const result = securitySessionsResultSchema.parse(body);

		expect(status).toBe(200);
		expect(result.ok && result.sessions.map((session) => session.id).sort())
			.toEqual([aliceLaptop.sessionId, alicePhone.sessionId].sort());
		expect(result.ok && result.sessions.find((session) => session.id === alicePhone.sessionId)).toMatchObject({
			browser: 'Safari',
			ipAddress: '203.0.113.7',
			isCurrent: true,
			lastSeenAt: FIXED_DATE.toISOString(),
			os: 'iOS',
			userAgent: SAFARI_ON_IPHONE
		});
		expect(result.ok && result.sessions.find((session) => session.id === aliceLaptop.sessionId)).toMatchObject({
			browser: 'Chrome',
			isCurrent: false,
			os: 'macOS'
		});
		expect(JSON.stringify(body)).not.toMatch(/token/i);
	});

	it('ends another session of the caller', async () => {
		const { app, sessionService } = createContext();
		const laptop = await signIn(sessionService, app, 'alice');
		const phone = await signIn(sessionService, app, 'alice');

		const { body, status } = await laptop.request(`/api/security/sessions/${phone.sessionId}`, { method: 'DELETE' });

		expect(status).toBe(200);
		expect(revokeSecuritySessionResultSchema.parse(body)).toEqual({ ok: true });
		expect(await listSessionIds('alice')).toEqual([laptop.sessionId]);
		expect((await phone.request('/api/security/sessions')).status).toBe(401);
	});

	it('refuses to end the current session through this route', async () => {
		const { app, sessionService } = createContext();
		const laptop = await signIn(sessionService, app, 'alice');

		const { body, status } = await laptop.request(`/api/security/sessions/${laptop.sessionId}`, { method: 'DELETE' });

		expect(status).toBe(409);
		expect(body).toMatchObject({ errorCode: 'current-session', ok: false });
		expect(await listSessionIds('alice')).toEqual([laptop.sessionId]);
	});

	it('cannot end another user\'s session and does not reveal it exists', async () => {
		const { app, sessionService } = createContext();
		const alice = await signIn(sessionService, app, 'alice');
		const bob = await signIn(sessionService, app, 'bob');

		const foreign = await alice.request(`/api/security/sessions/${bob.sessionId}`, { method: 'DELETE' });
		const missing = await alice.request('/api/security/sessions/no-such-session', { method: 'DELETE' });

		expect(foreign.status).toBe(404);
		expect(foreign.body).toEqual(missing.body);
		expect(await listSessionIds('bob')).toEqual([bob.sessionId]);
		expect((await bob.request('/api/security/sessions')).status).toBe(200);
	});

	it('ends all sessions except the current one and never touches other users', async () => {
		const { app, sessionService } = createContext();
		const laptop = await signIn(sessionService, app, 'alice');
		await signIn(sessionService, app, 'alice');
		await signIn(sessionService, app, 'alice');
		const bob = await signIn(sessionService, app, 'bob');

		const { body, status } = await laptop.request('/api/security/sessions/others', { method: 'DELETE' });

		expect(status).toBe(200);
		expect(revokeOtherSecuritySessionsResultSchema.parse(body)).toEqual({ ok: true, revokedSessionCount: 2 });
		expect(await listSessionIds('alice')).toEqual([laptop.sessionId]);
		expect(await listSessionIds('bob')).toEqual([bob.sessionId]);
	});
});
