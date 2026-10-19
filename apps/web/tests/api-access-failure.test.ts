import { ApiClient, ApiHttpError, readApiAccessFailure, subscribeToApiAccessFailures } from '@/shared/api';

import { HOUSEHOLD_REQUIRED_ERROR_CODE, HOUSEHOLD_REQUIRED_MESSAGE } from '@i-finances/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const HOUSEHOLD_REQUIRED_BODY = {
	errorCode: HOUSEHOLD_REQUIRED_ERROR_CODE,
	message: HOUSEHOLD_REQUIRED_MESSAGE,
	ok: false
};

const parseAny = { parse: (value: unknown) => value };

function respond(status: number, body: unknown, headers: Record<string, string> = {}): typeof globalThis.fetch {
	return async () => new Response(JSON.stringify(body), { headers, status });
}

describe('readApiAccessFailure', () => {
	it('recognises 401 and 403 household-required only', () => {
		expect(readApiAccessFailure(401, { errorCode: 'unauthenticated', ok: false })).toBe('unauthenticated');
		expect(readApiAccessFailure(403, HOUSEHOLD_REQUIRED_BODY)).toBe('household-required');
		expect(readApiAccessFailure(403, { errorCode: 'owner-required', message: '', ok: false })).toBeNull();
		expect(readApiAccessFailure(403, { errorCode: 'invalid-origin', message: '', ok: false })).toBeNull();
		expect(readApiAccessFailure(404, HOUSEHOLD_REQUIRED_BODY)).toBeNull();
		expect(readApiAccessFailure(500, undefined)).toBeNull();
	});
});

describe('ApiClient access failures', () => {
	const unsubscribers: (() => void)[] = [];

	afterEach(() => {
		for (const unsubscribe of unsubscribers.splice(0)) {
			unsubscribe();
		}
	});

	it('reports household-required on any data request before it throws', async () => {
		const listener = vi.fn();
		const client = new ApiClient({ fetcher: respond(403, HOUSEHOLD_REQUIRED_BODY) });

		unsubscribers.push(subscribeToApiAccessFailures(listener));

		await expect(client.get('/api/accounts', parseAny)).rejects.toBeInstanceOf(ApiHttpError);
		expect(listener).toHaveBeenCalledWith('household-required');
	});

	it('reports 401 and stays quiet about other failures', async () => {
		const listener = vi.fn();

		unsubscribers.push(subscribeToApiAccessFailures(listener));

		await expect(new ApiClient({ fetcher: respond(401, { ok: false }) }).get('/api/accounts', parseAny)).rejects.toThrow();
		await expect(new ApiClient({ fetcher: respond(409, { ok: false }) }).get('/api/accounts', parseAny)).rejects.toThrow();
		await expect(new ApiClient({ fetcher: respond(403, { errorCode: 'owner-required', ok: false }) })
			.get('/api/household', parseAny)).rejects.toThrow();

		expect(listener.mock.calls).toEqual([['unauthenticated']]);
	});

	it('stops reporting after unsubscribe', async () => {
		const listener = vi.fn();
		const unsubscribe = subscribeToApiAccessFailures(listener);

		unsubscribe();
		await expect(new ApiClient({ fetcher: respond(401, {}) }).get('/api/accounts', parseAny)).rejects.toThrow();

		expect(listener).not.toHaveBeenCalled();
	});

	it('keeps Retry-After of a 429 on the error', async () => {
		const client = new ApiClient({ fetcher: respond(429, { errorCode: 'rate-limited', ok: false }, { 'retry-after': '120' }) });

		await expect(client.post('/api/auth/telegram/start', {}, parseAny)).rejects.toMatchObject({
			retryAfterSeconds: 120,
			status: 429
		});
	});

	it('leaves Retry-After undefined when it is missing or not a number of seconds', async () => {
		const withoutHeader = new ApiClient({ fetcher: respond(429, {}) });
		const withDate = new ApiClient({ fetcher: respond(429, {}, { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }) });

		await expect(withoutHeader.get('/api/x', parseAny)).rejects.toMatchObject({ retryAfterSeconds: undefined });
		await expect(withDate.get('/api/x', parseAny)).rejects.toMatchObject({ retryAfterSeconds: undefined });
	});
});
