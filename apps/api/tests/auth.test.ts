import { createApiApp } from '@/app';
import { AuthHttpController } from '@/http/auth-controller';
import { CookieSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { sessions, users } from '@/infrastructure/database/schema';
import type { AuthConfig } from '@/modules/auth';
import {
	LoginRateLimiter,
	PasswordSignInService,
	PasswordUserRepository,
	PlatformAdminPolicy,
	SessionRepository,
	SessionService,
	SignInMethodsRepository
} from '@/modules/auth';
import { HouseholdCreationPolicy, HouseholdRepository, HouseholdResolver } from '@/modules/household';

import {
	currentSessionResponseSchema,
	passwordSignInResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
// Shaped like an Argon2 hash so it counts as a usable password; the verifier is a stub in these tests.
const STORED_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');
const AUTH_CONFIG: AuthConfig = {
	origin: 'http://localhost:5173',
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: 30 * 24 * 60 * 60 * 1000,
	trustedProxyCount: 0,
	webauthnRpId: 'localhost',
	webauthnRpName: 'iFinances'
};

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'stored-hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
});

afterEach(() => {
	connection.close();
});

function createAuthApp(options: { config?: AuthConfig; passwordValid?: boolean; rateLimiter?: LoginRateLimiter } = {}) {
	const sessionService = new SessionService(new SessionRepository(database), {
		config: AUTH_CONFIG,
		createId: () => 'session-1',
		createToken: () => 'opaque-session-token',
		now: () => FIXED_DATE
	});
	const passwordSignInService = new PasswordSignInService({
		passwordService: {
			verify: async () => options.passwordValid ?? true
		},
		rateLimiter: options.rateLimiter ?? new LoginRateLimiter(),
		sessionService,
		userRepository: {
			findByUsername: async () => ({
				displayName: 'Sergei Test',
				id: USER_ID,
				isActive: true,
				passwordHash: STORED_HASH,
				username: 'sergei'
			})
		}
	});
	const sessionResolver = new CookieSessionResolver(
		sessionService,
		AUTH_CONFIG.sessionCookieName
	);
	const controller = new AuthHttpController(
		passwordSignInService,
		sessionService,
		sessionResolver,
		new PasswordUserRepository(database),
		new HouseholdResolver(new HouseholdRepository(database)),
		new SignInMethodsRepository(database),
		new PlatformAdminPolicy(new Set(['sergei'])),
		new HouseholdCreationPolicy(database, new PlatformAdminPolicy(new Set(['sergei']))),
		options.config ?? AUTH_CONFIG
	);

	return createApiApp({ authController: controller });
}

describe('password session API', () => {
	it('creates a cookie-backed session and exposes current user state', async () => {
		const app = createAuthApp();
		const signInResponse = await app.request('/api/auth/sign-in', {
			body: JSON.stringify({
				password: 'correct-password',
				returnTo: '/categories',
				username: ' Sergei '
			}),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});
		const signInBody: unknown = await signInResponse.json();
		const cookie = signInResponse.headers.get('set-cookie');

		expect(signInResponse.status).toBe(200);
		expect(passwordSignInResultSchema.parse(signInBody)).toEqual({
			ok: true,
			redirectTo: '/categories'
		});
		expect(cookie).toContain('test_session=opaque-session-token');
		expect(cookie).toContain('HttpOnly');

		const currentResponse = await app.request('/api/auth/session', {
			headers: { cookie: cookie?.split(';')[0] ?? '' }
		});
		const currentBody: unknown = await currentResponse.json();

		expect(currentSessionResponseSchema.parse(currentBody)).toEqual({
			authenticated: true,
			// The administrator may found a household.
			canCreateHousehold: true,
			hasPassword: false,
			household: null,
			isPlatformAdmin: true,
			telegram: null,
			user: {
				displayName: 'Sergei Test',
				id: USER_ID,
				username: 'sergei'
			}
		});
	});

	it('stores the address the trusted proxy appended, not the one the client forged', async () => {
		const app = createAuthApp({ config: { ...AUTH_CONFIG, trustedProxyCount: 1 } });
		const response = await app.request('/api/auth/sign-in', {
			body: JSON.stringify({
				password: 'correct-password',
				username: 'sergei'
			}),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin,
				'user-agent': 'x'.repeat(2_000),
				'x-forwarded-for': '6.6.6.6, 203.0.113.7'
			},
			method: 'POST'
		});

		expect(response.status).toBe(200);

		const [session] = await database.select().from(sessions);

		expect(session.ipAddress).toBe('203.0.113.7');
		expect(session.userAgent).toBe('x'.repeat(512));
	});

	it('caps the stored address and user agent length at the session service', async () => {
		const sessionService = new SessionService(new SessionRepository(database), {
			config: AUTH_CONFIG,
			createId: () => 'session-long',
			now: () => FIXED_DATE
		});

		await sessionService.createSession(USER_ID, {
			ipAddress: 'a'.repeat(200),
			userAgent: 'b'.repeat(2_000)
		});

		const [session] = await database.select().from(sessions);

		expect(session.ipAddress).toHaveLength(64);
		expect(session.userAgent).toHaveLength(512);
	});

	it('rejects mutations without a valid origin hint', async () => {
		const app = createAuthApp();
		const response = await app.request('/api/auth/sign-in', {
			body: JSON.stringify({
				password: 'correct-password',
				username: 'sergei'
			}),
			headers: { 'content-type': 'application/json' },
			method: 'POST'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			errorCode: 'invalid-origin',
			ok: false
		});
	});

	it('revokes the session and clears the cookie on sign-out', async () => {
		const app = createAuthApp();
		const signInResponse = await app.request('/api/auth/sign-in', {
			body: JSON.stringify({
				password: 'correct-password',
				username: 'sergei'
			}),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});
		const cookie = signInResponse.headers.get('set-cookie')?.split(';')[0] ?? '';

		const signOutResponse = await app.request('/api/auth/sign-out', {
			headers: {
				cookie,
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});

		expect(signOutResponse.status).toBe(200);
		expect(signOutResponse.headers.get('set-cookie')).toContain('Max-Age=0');

		const currentResponse = await app.request('/api/auth/session', {
			headers: { cookie }
		});

		expect(await currentResponse.json()).toEqual({ authenticated: false });
	});

	it('returns generic invalid credentials without creating a session', async () => {
		const app = createAuthApp({ passwordValid: false });
		const response = await app.request('/api/auth/sign-in', {
			body: JSON.stringify({
				password: 'wrong-password',
				username: 'sergei'
			}),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			errorCode: 'invalid-credentials',
			ok: false
		});
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(response.headers.get('retry-after')).toBeNull();
	});
});

function requestWrongPassword(
	app: ReturnType<typeof createAuthApp>,
	forwardedFor: string,
	username = 'sergei'
): Promise<Response> {
	return Promise.resolve(app.request('/api/auth/sign-in', {
		body: JSON.stringify({
			password: 'wrong-password',
			username
		}),
		headers: {
			'content-type': 'application/json',
			origin: AUTH_CONFIG.origin,
			'x-forwarded-for': forwardedFor
		},
		method: 'POST'
	}));
}

describe('password sign-in rate limit', () => {
	it('is not bypassed by forging the left side of X-Forwarded-For', async () => {
		const app = createAuthApp({ config: { ...AUTH_CONFIG, trustedProxyCount: 1 }, passwordValid: false });

		for (let index = 0; index < 5; index += 1) {
			const response = await requestWrongPassword(app, `10.0.0.${index + 1}, 203.0.113.7`);

			expect(response.status).toBe(401);
		}

		const blocked = await requestWrongPassword(app, '10.0.0.99, 203.0.113.7');

		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('retry-after')).toBe('900');
		expect(await blocked.json()).not.toHaveProperty('retryAfterSeconds');
	});

	it('stops one address that tries many usernames, and still serves other addresses', async () => {
		const app = createAuthApp({ config: { ...AUTH_CONFIG, trustedProxyCount: 1 }, passwordValid: false });

		for (let index = 0; index < 30; index += 1) {
			const response = await requestWrongPassword(app, '10.0.0.1, 203.0.113.7', `victim-${index}`);

			expect(response.status).toBe(401);
		}

		expect((await requestWrongPassword(app, '203.0.113.7', 'victim-new')).status).toBe(429);
		expect((await requestWrongPassword(app, '203.0.113.8', 'victim-new')).status).toBe(401);
	});

	it('is not bypassed by rotating real addresses either', async () => {
		const app = createAuthApp({ config: { ...AUTH_CONFIG, trustedProxyCount: 1 }, passwordValid: false });

		for (let index = 0; index < 20; index += 1) {
			const response = await requestWrongPassword(app, `203.0.113.${index + 1}`);

			expect(response.status).toBe(401);
		}

		const blocked = await requestWrongPassword(app, '203.0.113.200');

		expect(blocked.status).toBe(429);
	});
});

async function signIn(app: ReturnType<typeof createAuthApp>): Promise<string> {
	const response = await app.request('/api/auth/sign-in', {
		body: JSON.stringify({
			password: 'correct-password',
			username: 'sergei'
		}),
		headers: {
			'content-type': 'application/json',
			origin: AUTH_CONFIG.origin
		},
		method: 'POST'
	});

	return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

describe('update display name API', () => {
	it('updates the display name and persists it', async () => {
		const app = createAuthApp();
		const cookie = await signIn(app);

		const response = await app.request('/api/auth/display-name', {
			body: JSON.stringify({ displayName: '  Новый Сергей  ' }),
			headers: {
				cookie,
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'PUT'
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			displayName: 'Новый Сергей',
			ok: true
		});

		const [persisted] = await database.select({ displayName: users.displayName })
			.from(users)
			.where(eq(users.id, USER_ID));

		expect(persisted.displayName).toBe('Новый Сергей');

		const currentResponse = await app.request('/api/auth/session', {
			headers: { cookie }
		});

		expect(currentSessionResponseSchema.parse(await currentResponse.json())).toEqual({
			authenticated: true,
			// The administrator may found a household.
			canCreateHousehold: true,
			hasPassword: false,
			household: null,
			isPlatformAdmin: true,
			telegram: null,
			user: {
				displayName: 'Новый Сергей',
				id: USER_ID,
				username: 'sergei'
			}
		});
	});

	it('rejects an empty display name', async () => {
		const app = createAuthApp();
		const cookie = await signIn(app);

		const response = await app.request('/api/auth/display-name', {
			body: JSON.stringify({ displayName: '   ' }),
			headers: {
				cookie,
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'PUT'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			errorCode: 'invalid-input',
			ok: false
		});
	});

	it('rejects a display name longer than 100 characters', async () => {
		const app = createAuthApp();
		const cookie = await signIn(app);

		const response = await app.request('/api/auth/display-name', {
			body: JSON.stringify({ displayName: 'a'.repeat(101) }),
			headers: {
				cookie,
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'PUT'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			errorCode: 'invalid-input',
			ok: false
		});
	});

	it('rejects the request without an active session', async () => {
		const app = createAuthApp();

		const response = await app.request('/api/auth/display-name', {
			body: JSON.stringify({ displayName: 'Кто-то' }),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'PUT'
		});

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			errorCode: 'unauthenticated',
			ok: false
		});
	});

	it('rejects mutations without a valid origin hint', async () => {
		const app = createAuthApp();
		const cookie = await signIn(app);

		const response = await app.request('/api/auth/display-name', {
			body: JSON.stringify({ displayName: 'Кто-то' }),
			headers: {
				cookie,
				'content-type': 'application/json'
			},
			method: 'PUT'
		});

		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({
			errorCode: 'invalid-origin',
			ok: false
		});

		const [persisted] = await database.select({ displayName: users.displayName })
			.from(users)
			.where(eq(users.id, USER_ID));

		expect(persisted.displayName).toBe('Sergei Test');
	});
});
