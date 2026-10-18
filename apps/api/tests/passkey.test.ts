import { createApiApp } from '@/app';
import { PasskeyHttpController } from '@/http/passkey-controller';
import { CookieSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { telegramAccounts, users, webauthnChallenges } from '@/infrastructure/database/schema';
import type { AuthConfig } from '@/modules/auth';
import {
	SessionRepository,
	SessionService,
	SignInMethodsRepository,
	WebAuthnChallengeRepository,
	WebAuthnCredentialRepository,
	WebAuthnService
} from '@/modules/auth';

import {
	passkeyAuthenticationOptionsSchema,
	passkeyRegistrationOptionsSchema,
	passkeyRegistrationResultSchema,
	passkeySignInResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = 'user-1';
// Shaped like an Argon2 hash, so the user counts as having a password (the passkey `userName` depends on it).
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
		passwordHash: STORED_HASH,
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
});

afterEach(() => {
	connection.close();
});

function createPasskeyApp(config: AuthConfig = AUTH_CONFIG) {
	let nextChallengeId = 0;
	const sessionService = new SessionService(new SessionRepository(database), {
		config: AUTH_CONFIG,
		createId: () => 'session-1',
		createToken: () => 'opaque-session-token',
		now: () => FIXED_DATE
	});
	const service = new WebAuthnService({
		challengeRepository: new WebAuthnChallengeRepository(database),
		config: AUTH_CONFIG,
		createId: () => `challenge-${nextChallengeId++}`,
		credentialRepository: new WebAuthnCredentialRepository(database),
		now: () => FIXED_DATE,
		sessionService,
		signInMethods: new SignInMethodsRepository(database)
	});
	const controller = new PasskeyHttpController(
		service,
		new CookieSessionResolver(sessionService, AUTH_CONFIG.sessionCookieName),
		config
	);

	return {
		app: createApiApp({ passkeyController: controller }),
		service,
		sessionService
	};
}

describe('passkey API', () => {
	it('creates an authentication challenge with a browser-safe options response', async () => {
		const { app } = createPasskeyApp();
		const response = await app.request('/api/auth/passkey/sign-in/options', {
			headers: { origin: AUTH_CONFIG.origin },
			method: 'POST'
		});
		const body: unknown = await response.json();

		expect(response.status).toBe(200);
		expect(passkeyAuthenticationOptionsSchema.parse(body)).toMatchObject({
			challenge: expect.any(String),
			userVerification: 'preferred'
		});

		const challenges = await database.select().from(webauthnChallenges);

		expect(challenges).toHaveLength(1);
		expect(challenges[0]?.purpose).toBe('authentication');
	});

	it('rejects passkey mutations without a valid origin hint', async () => {
		const { app } = createPasskeyApp();
		const response = await app.request('/api/auth/passkey/sign-in/options', {
			method: 'POST'
		});
		const body: unknown = await response.json();

		expect(response.status).toBe(403);
		expect(passkeySignInResultSchema.parse(body)).toMatchObject({
			errorCode: 'invalid-origin',
			ok: false
		});
	});

	it('requires an authenticated session for passkey registration', async () => {
		const { app } = createPasskeyApp();
		const response = await app.request('/api/auth/passkey/registration/options', {
			headers: { origin: AUTH_CONFIG.origin },
			method: 'POST'
		});
		const body: unknown = await response.json();

		expect(response.status).toBe(401);
		expect(passkeyRegistrationResultSchema.parse(body)).toMatchObject({
			errorCode: 'authentication-required',
			ok: false
		});
	});

	it('creates a user-bound registration challenge for an active session', async () => {
		const { app, sessionService } = createPasskeyApp();
		const session = await sessionService.createSession(USER_ID);
		const response = await app.request('/api/auth/passkey/registration/options', {
			headers: {
				cookie: `${AUTH_CONFIG.sessionCookieName}=${session.token}`,
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});
		const body: unknown = await response.json();

		expect(response.status).toBe(200);
		expect(passkeyRegistrationOptionsSchema.parse(body)).toMatchObject({
			challenge: expect.any(String),
			rp: { name: AUTH_CONFIG.webauthnRpName },
			user: {
				id: expect.any(String),
				name: 'sergei'
			}
		});

		const [challenge] = await database.select().from(webauthnChallenges);

		expect(challenge.purpose).toBe('registration');
		expect(challenge.userId).toBe(USER_ID);
	});

	describe('passkey userName of a user without a password (A10)', () => {
		const registrationUserName = async (): Promise<string> => {
			const { app, sessionService } = createPasskeyApp();
			const session = await sessionService.createSession(USER_ID);
			const response = await app.request('/api/auth/passkey/registration/options', {
				headers: { cookie: `${AUTH_CONFIG.sessionCookieName}=${session.token}`, origin: AUTH_CONFIG.origin },
				method: 'POST'
			});

			expect(response.status).toBe(200);

			return passkeyRegistrationOptionsSchema.parse(await response.json()).user.name;
		};

		const linkTelegram = async (username: string | null): Promise<void> => {
			await database.insert(telegramAccounts).values({
				chatId: '5005',
				firstName: 'Анна',
				lastName: null,
				lastSignInAt: FIXED_DATE,
				linkedAt: FIXED_DATE,
				telegramId: '5005',
				updatedAt: FIXED_DATE,
				userId: USER_ID,
				username
			});
		};

		beforeEach(async () => {
			await database.update(users).set({ passwordHash: null, username: 'tg-5005' });
		});

		it('is the Telegram @username, never tg-<id>', async () => {
			await linkTelegram('anna_k');

			expect(await registrationUserName()).toBe('@anna_k');
		});

		it('is the display name when Telegram has no username', async () => {
			await linkTelegram(null);

			expect(await registrationUserName()).toBe('Sergei Test');
		});

		it('stays the username for a user with a password, even with Telegram linked', async () => {
			await database.update(users).set({ passwordHash: STORED_HASH, username: 'sergei' });
			await linkTelegram('anna_k');

			expect(await registrationUserName()).toBe('sergei');
		});
	});

	it('rejects malformed authentication and registration responses before verification', async () => {
		const { app, sessionService } = createPasskeyApp();
		const session = await sessionService.createSession(USER_ID);
		const signInResponse = await app.request('/api/auth/passkey/sign-in/verification', {
			body: '{}',
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});
		const registrationResponse = await app.request('/api/auth/passkey/registration/verification', {
			body: '{}',
			headers: {
				'content-type': 'application/json',
				cookie: `${AUTH_CONFIG.sessionCookieName}=${session.token}`,
				origin: AUTH_CONFIG.origin
			},
			method: 'POST'
		});

		expect(signInResponse.status).toBe(400);
		expect(passkeySignInResultSchema.parse(await signInResponse.json())).toMatchObject({
			errorCode: 'invalid-input',
			ok: false
		});
		expect(registrationResponse.status).toBe(400);
		expect(passkeyRegistrationResultSchema.parse(await registrationResponse.json())).toMatchObject({
			errorCode: 'invalid-input',
			ok: false
		});
	});

	it('passes the address appended by the trusted proxy to passkey sign-in, not the forged one', async () => {
		const { app, service } = createPasskeyApp({ ...AUTH_CONFIG, trustedProxyCount: 1 });
		const finishAuthentication = vi.spyOn(service, 'finishAuthentication').mockResolvedValue({
			errorCode: 'invalid-credentials',
			message: 'unused',
			ok: false
		});
		const response = await app.request('/api/auth/passkey/sign-in/verification', {
			body: JSON.stringify({
				response: {
					id: 'credential',
					rawId: 'credential',
					response: {
						authenticatorData: 'data',
						clientDataJSON: 'client',
						signature: 'signature'
					},
					type: 'public-key'
				}
			}),
			headers: {
				'content-type': 'application/json',
				origin: AUTH_CONFIG.origin,
				'x-forwarded-for': '6.6.6.6, 203.0.113.7'
			},
			method: 'POST'
		});

		expect(response.status).toBe(401);
		expect(finishAuthentication).toHaveBeenCalledWith(expect.objectContaining({
			metadata: expect.objectContaining({ ipAddress: '203.0.113.7' })
		}));
	});
});
