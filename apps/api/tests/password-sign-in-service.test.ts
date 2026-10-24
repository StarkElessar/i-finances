import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { sessions, users } from '@/infrastructure/database/schema';
import {
	DUMMY_PASSWORD_HASH,
	getPasswordSignInConfig,
	hasUsablePassword,
	LoginRateLimiter,
	type PasswordAuthUserRecord,
	PasswordService,
	PasswordSignInService,
	type PasswordUserPort,
	PasswordUserRepository,
	PasswordVerificationLimiter,
	SessionRepository,
	SessionService
} from '@/modules/auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORED_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';
const USER: PasswordAuthUserRecord = {
	displayName: 'Sergei Test',
	id: 'user-1',
	isActive: true,
	passwordHash: STORED_HASH,
	username: 'sergei'
};
const CREDENTIALS = {
	password: 'correct-password-123',
	username: 'sergei'
};

function createService(options: {
	findByUsername?: PasswordUserPort['findByUsername'];
	rateLimiter?: LoginRateLimiter;
	verify?: (passwordHash: string, password: string) => Promise<boolean>;
	verificationLimiter?: PasswordVerificationLimiter;
} = {}) {
	const verify = vi.fn(options.verify ?? (async () => true));
	const createSession = vi.fn(() => true);
	const service = new PasswordSignInService({
		passwordService: { verify },
		rateLimiter: options.rateLimiter ?? new LoginRateLimiter(),
		sessionService: { draftSession },
		userRepository: {
			findByUsername: options.findByUsername ?? (async () => USER),
			insertSessionIfPasswordUnchanged: createSession
		},
		verificationLimiter: options.verificationLimiter ?? new PasswordVerificationLimiter(getPasswordSignInConfig({}))
	});

	return { createSession, service, verify };
}

function draftSession() {
	const now = new Date();

	return {
		record: { createdAt: now, expiresAt: now, id: 'session-1', lastSeenAt: now, tokenHash: 'token-hash' },
		session: { expiresAt: now, token: 'token' }
	};
}

describe('PasswordSignInService rate limiting', () => {
	it('releases admission after repository errors so the queue can continue', async () => {
		let failLookup!: () => void;
		const lookup = new Promise<void>((resolve) => {
			failLookup = resolve;
		});
		const findByUsername = vi.fn<PasswordUserPort['findByUsername']>()
			.mockImplementationOnce(async () => {
				await lookup;

				throw new Error('database unavailable');
			})
			.mockResolvedValue(USER);
		const { service, verify } = createService({
			findByUsername,
			verificationLimiter: new PasswordVerificationLimiter({ maxConcurrent: 1, maxQueue: 1, queueTimeoutMilliseconds: 2000 })
		});
		const failed = service.signIn(CREDENTIALS);
		const failure = expect(failed).rejects.toThrow('database unavailable');
		const queued = service.signIn(CREDENTIALS);

		failLookup();
		await failure;
		expect((await queued).ok).toBe(true);
		expect(verify).toHaveBeenCalledTimes(1);
	});

	it('releases admission when the verifier throws and for subsequent successful logins', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const verify = vi.fn<() => Promise<boolean>>()
			.mockRejectedValueOnce(new Error('broken verifier'))
			.mockResolvedValue(true);
		const { service } = createService({
			verificationLimiter: new PasswordVerificationLimiter({ maxConcurrent: 1, maxQueue: 0, queueTimeoutMilliseconds: 2000 }),
			verify
		});

		try {
			expect(await service.signIn(CREDENTIALS)).toMatchObject({ errorCode: 'invalid-credentials', ok: false });
			expect((await service.signIn(CREDENTIALS)).ok).toBe(true);
			expect((await service.signIn(CREDENTIALS)).ok).toBe(true);
		}
		finally {
			consoleError.mockRestore();
		}
	});

	it('verifies at most the allowed number of passwords when requests arrive in parallel', async () => {
		let openGate!: () => void;
		const gate = new Promise<void>((resolve) => {
			openGate = resolve;
		});
		const { service, verify } = createService({
			verify: async () => {
				await gate;

				return false;
			}
		});
		const attempts = Array.from({ length: 20 }, () => service.signIn(CREDENTIALS, { ipAddress: '203.0.113.7' }));

		await new Promise((resolve) => setImmediate(resolve));
		openGate();

		const outcomes = await Promise.all(attempts);
		const errorCodes = outcomes.map((outcome) => (outcome.ok ? 'ok' : outcome.errorCode));

		expect(verify).toHaveBeenCalledTimes(5);
		expect(errorCodes.filter((code) => code === 'invalid-credentials')).toHaveLength(5);
		expect(errorCodes.filter((code) => code === 'rate-limited')).toHaveLength(15);
	});

	it('does not let a valid sign-in count against the limit', async () => {
		const { service } = createService();

		for (let index = 0; index < 30; index += 1) {
			const outcome = await service.signIn(CREDENTIALS, { ipAddress: '203.0.113.7' });

			expect(outcome.ok).toBe(true);
		}
	});
});

describe('PasswordSignInService accounts without a usable password', () => {
	it('answers 401-style invalid credentials instead of throwing on a hash the verifier cannot read', async () => {
		const service = new PasswordSignInService({
			passwordService: new PasswordService(),
			rateLimiter: new LoginRateLimiter(),
			sessionService: { draftSession },
			userRepository: {
				findByUsername: async () => ({ ...USER, passwordHash: 'telegram-only' }),
				insertSessionIfPasswordUnchanged: () => {
					throw new Error('No session expected.');
				}
			},
			verificationLimiter: new PasswordVerificationLimiter(getPasswordSignInConfig({}))
		});

		const outcome = await service.signIn(CREDENTIALS);

		expect(outcome).toMatchObject({ errorCode: 'invalid-credentials', ok: false });
	});

	it('still verifies a password that was really hashed by the password service', async () => {
		const passwordService = new PasswordService();
		const passwordHash = await passwordService.hash(CREDENTIALS.password);
		const service = new PasswordSignInService({
			passwordService,
			rateLimiter: new LoginRateLimiter(),
			sessionService: { draftSession },
			userRepository: { findByUsername: async () => ({ ...USER, passwordHash }), insertSessionIfPasswordUnchanged: () => true },
			verificationLimiter: new PasswordVerificationLimiter(getPasswordSignInConfig({}))
		});

		expect((await service.signIn(CREDENTIALS)).ok).toBe(true);
		expect((await service.signIn({ ...CREDENTIALS, password: 'wrong-password-123' })).ok).toBe(false);
	});

	it.each([
		['an unknown user', async () => undefined],
		['an inactive user', async () => ({ ...USER, isActive: false })],
		['an account without a password (NULL hash)', async () => ({ ...USER, passwordHash: null })],
		['an account without a usable hash', async () => ({ ...USER, passwordHash: 'telegram-only' })],
		['an account with an empty hash', async () => ({ ...USER, passwordHash: '' })]
	])('spends one Argon2 verification on the dummy hash for %s and never signs in', async (_name, findByUsername) => {
		const { createSession, service, verify } = createService({ findByUsername });

		const outcome = await service.signIn(CREDENTIALS);

		// The stub verifier says "match" for everything: only the missing real hash can reject this attempt.
		expect(outcome).toMatchObject({ errorCode: 'invalid-credentials', ok: false });
		expect(verify).toHaveBeenCalledTimes(1);
		expect(verify).toHaveBeenCalledWith(DUMMY_PASSWORD_HASH, CREDENTIALS.password);
		expect(createSession).not.toHaveBeenCalled();
	});

	it('verifies against the stored hash for a usable password', async () => {
		const { service, verify } = createService();

		await service.signIn(CREDENTIALS);

		expect(verify).toHaveBeenCalledTimes(1);
		expect(verify).toHaveBeenCalledWith(STORED_HASH, CREDENTIALS.password);
	});

	it('treats a verifier failure as a wrong password', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { service } = createService({
			verify: () => Promise.reject(new Error('corrupted hash'))
		});

		const outcome = await service.signIn(CREDENTIALS);

		expect(outcome).toMatchObject({ errorCode: 'invalid-credentials', ok: false });

		consoleError.mockRestore();
	});

	it('keeps the dummy hash in step with what PasswordService produces: variant, version, cost and lengths', async () => {
		// `$argon2id$v=19$m=…,t=…,p=…$<salt>$<hash>`: without this a change of the cost in `password-service.ts` alone
		// would make unknown users answer faster than wrong passwords again.
		const shapeOf = (hash: string) => {
			const [, variant, version, cost, salt, digest] = hash.split('$');

			return { cost, digestLength: digest.length, saltLength: salt.length, variant, version };
		};
		const fresh = await new PasswordService().hash('any-password-123');

		expect(shapeOf(DUMMY_PASSWORD_HASH)).toEqual(shapeOf(fresh));
	});

	it('keeps the dummy hash readable by the real verifier with the real cost parameters', async () => {
		expect(hasUsablePassword(DUMMY_PASSWORD_HASH)).toBe(true);
		expect(DUMMY_PASSWORD_HASH).toContain('$argon2id$v=19$m=19456,t=2,p=1$');
		await expect(new PasswordService().verify(DUMMY_PASSWORD_HASH, 'any-password-123')).resolves.toBe(false);
	});
});

describe('PasswordSignInService against a parallel password change', () => {
	const NOW = new Date('2026-10-23T10:00:00.000Z');
	const NEW_HASH = '$argon2id$v=19$m=19456,t=2,p=1$bmV3c2FsdA$bmV3aGFzaA';
	let connection: Database.Database;
	let database: AppDatabase;

	beforeEach(async () => {
		connection = new Database(':memory:');
		connection.pragma('foreign_keys = ON');
		database = drizzle(connection, { schema });
		migrate(database, { migrationsFolder: './drizzle' });
		await database.insert(users).values({ ...USER, createdAt: NOW, updatedAt: NOW });
		await database.insert(sessions).values({
			createdAt: NOW,
			expiresAt: new Date(NOW.getTime() + 86_400_000),
			id: 'owner-session',
			lastSeenAt: NOW,
			tokenHash: 'owner',
			userId: USER.id
		});
	});

	afterEach(() => {
		connection.close();
	});

	function createRealService(whileVerifying: () => Promise<void>) {
		const sessionService = new SessionService(new SessionRepository(database), {
			config: {
				origin: 'http://localhost:5173',
				sessionCookieName: 'test_session',
				sessionTtlMilliseconds: 86_400_000,
				trustedProxyCount: 0,
				webauthnRpId: 'localhost',
				webauthnRpName: 'iFinances'
			},
			now: () => NOW
		});
		const service = new PasswordSignInService({
			passwordService: {
				// The old password is right for the hash this request read; the change commits while Argon2 runs.
				verify: async () => {
					await whileVerifying();

					return true;
				}
			},
			rateLimiter: new LoginRateLimiter(),
			sessionService,
			userRepository: new PasswordUserRepository(database),
			verificationLimiter: new PasswordVerificationLimiter(getPasswordSignInConfig({}))
		});

		return { service, sessionService };
	}

	function sessionIds(): string[] {
		return database.select({ id: sessions.id }).from(sessions).all().map((row) => row.id);
	}

	it('creates no session with the old password once the owner changed it during the verification', async () => {
		const { service, sessionService } = createRealService(async () => {
			const replaced = new PasswordUserRepository(database).replacePasswordAndRotateSessions({
				expectedPasswordHash: STORED_HASH,
				keepSessionId: 'owner-session',
				newPasswordHash: NEW_HASH,
				now: NOW,
				rotatedTokenHash: 'owner-rotated',
				userId: USER.id
			});

			expect(replaced).toBeDefined();
		});

		const outcome = await service.signIn(CREDENTIALS, { ipAddress: '203.0.113.7' });
		const token = outcome.ok ? outcome.session.token : undefined;

		expect(outcome).toMatchObject({ errorCode: 'invalid-credentials', ok: false });
		expect(await sessionService.validateSessionToken(token)).toBeNull();
		expect(sessionIds()).toEqual(['owner-session']);
	});

	it('creates no session for a user deactivated during the verification', async () => {
		const { service } = createRealService(async () => {
			database.update(users).set({ isActive: false }).where(eq(users.id, USER.id)).run();
		});

		const outcome = await service.signIn(CREDENTIALS);

		expect(outcome).toMatchObject({ errorCode: 'invalid-credentials', ok: false });
		expect(sessionIds()).toEqual(['owner-session']);
	});

	it('still signs in when nothing changed meanwhile', async () => {
		const { service, sessionService } = createRealService(async () => undefined);

		const outcome = await service.signIn(CREDENTIALS);

		expect(outcome.ok).toBe(true);
		expect(await sessionService.validateSessionToken(outcome.ok ? outcome.session.token : undefined)).toMatchObject({
			user: { id: USER.id }
		});
		expect(sessionIds()).toHaveLength(2);
	});
});

describe('hasUsablePassword', () => {
	it('accepts Argon2 PHC strings only', () => {
		expect(hasUsablePassword(STORED_HASH)).toBe(true);
		expect(hasUsablePassword('$argon2i$v=19$m=16,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
		expect(hasUsablePassword('$argon2d$v=19$m=16,t=2,p=1$c2FsdA$aGFzaA')).toBe(true);
		expect(hasUsablePassword('')).toBe(false);
		expect(hasUsablePassword('stored-hash')).toBe(false);
		expect(hasUsablePassword('$2b$10$abcdefghijklmnopqrstuv')).toBe(false);
		expect(hasUsablePassword('x$argon2id$')).toBe(false);
		expect(hasUsablePassword('$argon2x$v=19$m=16,t=2,p=1$c2FsdA$aGFzaA')).toBe(false);
		expect(hasUsablePassword('$argon2id$garbage')).toBe(false);
		expect(hasUsablePassword('$argon2id$v=19$m=16,t=2,p=1$c2FsdA')).toBe(false);
		expect(hasUsablePassword('$argon2id$v=19$m=16,t=2,p=1$c2FsdA$aGFzaA extra')).toBe(false);
		expect(hasUsablePassword(null)).toBe(false);
		expect(hasUsablePassword(undefined)).toBe(false);
	});
});
