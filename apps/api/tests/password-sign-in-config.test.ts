import { getPasswordSignInConfig } from '@/modules/auth';

import { describe, expect, it } from 'vitest';

describe('getPasswordSignInConfig', () => {
	it('sets process-wide bounds by default', () => {
		expect(getPasswordSignInConfig({})).toEqual({
			maxConcurrent: 8,
			maxCounterKeys: 10_000,
			maxQueue: 64,
			queueTimeoutMilliseconds: 2_000
		});
	});

	it('reads explicit limits, including disabling the queue', () => {
		expect(getPasswordSignInConfig({
			LOGIN_RATE_LIMIT_MAX_KEYS: '100',
			PASSWORD_VERIFY_MAX_CONCURRENT: '2',
			PASSWORD_VERIFY_MAX_QUEUE: '0',
			PASSWORD_VERIFY_QUEUE_TIMEOUT_MS: '500'
		})).toEqual({ maxConcurrent: 2, maxCounterKeys: 100, maxQueue: 0, queueTimeoutMilliseconds: 500 });
	});

	it.each([
		['PASSWORD_VERIFY_MAX_CONCURRENT', ['0', '9', '1000', '-1', '1.5', 'abc', '']],
		['PASSWORD_VERIFY_MAX_QUEUE', ['-1', '65', '1.5', 'abc']],
		['PASSWORD_VERIFY_QUEUE_TIMEOUT_MS', ['0', '10001', '1.5', 'abc', '']],
		['LOGIN_RATE_LIMIT_MAX_KEYS', ['0', '100001', '1.5', 'abc', '']]
	])('rejects invalid %s before startup', (name, values) => {
		for (const value of values) {
			expect(() => getPasswordSignInConfig({ [name]: value })).toThrow(name);
		}
	});
});
