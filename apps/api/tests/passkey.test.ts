import {
	passkeyAuthenticationOptionsSchema,
	passkeyRegistrationOptionsSchema,
	passkeyRegistrationResultSchema,
	passkeySignInResultSchema
} from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from '../src/app';
import { PasskeyHttpController } from '../src/http/passkey-controller';
import { CookieSessionResolver } from '../src/http/session-resolver';
import type { AppDatabase } from '../src/infrastructure/database/client';
import * as schema from '../src/infrastructure/database/schema';
import { users, webauthnChallenges } from '../src/infrastructure/database/schema';
import type { AuthConfig } from '../src/modules/auth';
import {
	SessionRepository,
	SessionService,
	WebAuthnChallengeRepository,
	WebAuthnCredentialRepository,
	WebAuthnService
} from '../src/modules/auth';

const USER_ID = 'user-1';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');
const AUTH_CONFIG: AuthConfig = {
	origin: 'http://localhost:5173',
	sessionCookieName: 'test_session',
	sessionTtlMilliseconds: 30 * 24 * 60 * 60 * 1000,
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

function createPasskeyApp() {
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
		sessionService
	});
	const controller = new PasskeyHttpController(
		service,
		new CookieSessionResolver(sessionService, AUTH_CONFIG.sessionCookieName),
		AUTH_CONFIG
	);

	return {
		app: createApiApp({ passkeyController: controller }),
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
});
