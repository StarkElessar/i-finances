import {
	DUMMY_PASSWORD_HASH,
	hasUsablePassword,
	LoginRateLimiter,
	type PasswordAuthUserRecord,
	PasswordService,
	PasswordSignInService,
	type PasswordUserPort
} from '@/modules/auth';

import { describe, expect, it, vi } from 'vitest';

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
} = {}) {
	const verify = vi.fn(options.verify ?? (async () => true));
	const createSession = vi.fn(async () => ({ expiresAt: new Date(), token: 'token' }));
	const service = new PasswordSignInService({
		passwordService: { verify },
		rateLimiter: options.rateLimiter ?? new LoginRateLimiter(),
		sessionService: { createSession },
		userRepository: { findByUsername: options.findByUsername ?? (async () => USER) }
	});

	return { createSession, service, verify };
}

describe('PasswordSignInService rate limiting', () => {
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
			sessionService: { createSession: () => Promise.reject(new Error('No session expected.')) },
			userRepository: { findByUsername: async () => ({ ...USER, passwordHash: 'telegram-only' }) }
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
			sessionService: { createSession: async () => ({ expiresAt: new Date(), token: 'token' }) },
			userRepository: { findByUsername: async () => ({ ...USER, passwordHash }) }
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

	it('keeps the dummy hash readable by the real verifier with the real cost parameters', async () => {
		expect(hasUsablePassword(DUMMY_PASSWORD_HASH)).toBe(true);
		expect(DUMMY_PASSWORD_HASH).toContain('$argon2id$v=19$m=19456,t=2,p=1$');
		await expect(new PasswordService().verify(DUMMY_PASSWORD_HASH, 'any-password-123')).resolves.toBe(false);
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
