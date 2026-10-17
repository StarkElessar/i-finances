import {
	LoginRateLimiter,
	type PasswordAuthUserRecord,
	PasswordSignInService
} from '@/modules/auth';

import { describe, expect, it } from 'vitest';

const USER: PasswordAuthUserRecord = {
	displayName: 'Sergei Test',
	id: 'user-1',
	isActive: true,
	passwordHash: 'stored-hash',
	username: 'sergei'
};

describe('PasswordSignInService rate limiting', () => {
	it('verifies at most the allowed number of passwords when requests arrive in parallel', async () => {
		let verifyCalls = 0;
		let openGate!: () => void;
		const gate = new Promise<void>((resolve) => {
			openGate = resolve;
		});
		const service = new PasswordSignInService({
			passwordService: {
				verify: async () => {
					verifyCalls += 1;
					await gate;

					return false;
				}
			},
			rateLimiter: new LoginRateLimiter(),
			sessionService: {
				createSession: () => Promise.reject(new Error('No session expected.'))
			},
			userRepository: { findByUsername: async () => USER }
		});
		const attempts = Array.from({ length: 20 }, () => service.signIn({
			password: 'wrong-password-123',
			username: 'sergei'
		}, { ipAddress: '203.0.113.7' }));

		await new Promise((resolve) => setImmediate(resolve));
		openGate();

		const outcomes = await Promise.all(attempts);
		const errorCodes = outcomes.map((outcome) => (outcome.ok ? 'ok' : outcome.errorCode));

		expect(verifyCalls).toBe(5);
		expect(errorCodes.filter((code) => code === 'invalid-credentials')).toHaveLength(5);
		expect(errorCodes.filter((code) => code === 'rate-limited')).toHaveLength(15);
	});

	it('does not let a valid sign-in count against the limit', async () => {
		const service = new PasswordSignInService({
			passwordService: { verify: async () => true },
			rateLimiter: new LoginRateLimiter(),
			sessionService: {
				createSession: async () => ({ expiresAt: new Date(), token: 'token' })
			},
			userRepository: { findByUsername: async () => USER }
		});

		for (let index = 0; index < 30; index += 1) {
			const outcome = await service.signIn({
				password: 'correct-password-123',
				username: 'sergei'
			}, { ipAddress: '203.0.113.7' });

			expect(outcome.ok).toBe(true);
		}
	});
});
