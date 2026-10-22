import {
	type ApiAccessFailure,
	ApiClient,
	ApiHttpError,
	beginSessionRotation,
	resetSessionRotationGate,
	SESSION_ROTATION_HOLD_LIMIT_MS,
	subscribeToApiAccessFailures
} from '@/shared/api';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parseAny = { parse: (value: unknown) => value };

/** A fetcher whose answers are released by the test, in the order it chooses. */
function createControlledFetcher() {
	const pending: ((response: Response) => void)[] = [];
	const fetcher: typeof globalThis.fetch = () => new Promise<Response>((resolve) => {
		pending.push(resolve);
	});

	return {
		answer: (index: number, status: number, body: unknown) => pending[index]?.(new Response(JSON.stringify(body), { status })),
		fetcher
	};
}

const UNAUTHENTICATED = { errorCode: 'unauthenticated', ok: false };

describe('session rotation gate', () => {
	const unsubscribers: (() => void)[] = [];
	let listener: ReturnType<typeof vi.fn<(failure: ApiAccessFailure) => void>>;

	beforeEach(() => {
		resetSessionRotationGate();
		listener = vi.fn<(failure: ApiAccessFailure) => void>();
		unsubscribers.push(subscribeToApiAccessFailures(listener));
	});

	afterEach(() => {
		for (const unsubscribe of unsubscribers.splice(0)) {
			unsubscribe();
		}
	});

	it('does not sign out for a 401 of a request that left with the old cookie while the change succeeded', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const client = new ApiClient({ fetcher });
		const settle = beginSessionRotation();
		const staleRequest = client.get('/api/security/sessions', parseAny).catch((error: unknown) => error);

		// The old cookie is dead the moment the server commits, so the stale request answers 401 before the change does.
		answer(0, 401, UNAUTHENTICATED);
		expect(await staleRequest).toBeInstanceOf(ApiHttpError);
		expect(listener).not.toHaveBeenCalled();

		settle('rotated');
		expect(listener).not.toHaveBeenCalled();
	});

	it('drops a 401 that arrives after the change for a request that left before it', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const client = new ApiClient({ fetcher });
		const staleRequest = client.get('/api/accounts', parseAny).catch((error: unknown) => error);
		const settle = beginSessionRotation();

		settle('rotated');
		answer(0, 401, UNAUTHENTICATED);
		await staleRequest;
		expect(listener).not.toHaveBeenCalled();
	});

	it('still signs out for a 401 of a request that left after the change', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const client = new ApiClient({ fetcher });

		beginSessionRotation()('rotated');

		const freshRequest = client.get('/api/accounts', parseAny).catch((error: unknown) => error);

		answer(0, 401, UNAUTHENTICATED);
		await freshRequest;
		expect(listener).toHaveBeenCalledWith('unauthenticated');
	});

	it('reports the held 401 once the change has failed: the session really is gone', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const client = new ApiClient({ fetcher });
		const settle = beginSessionRotation();
		const request = client.post('/api/security/password', {}, parseAny).catch((error: unknown) => error);

		answer(0, 401, UNAUTHENTICATED);
		await request;
		expect(listener).not.toHaveBeenCalled();

		settle('failed');
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith('unauthenticated');
	});

	it('passes a 401 through when no change is running', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const request = new ApiClient({ fetcher }).get('/api/accounts', parseAny).catch((error: unknown) => error);

		answer(0, 401, UNAUTHENTICATED);
		await request;
		expect(listener).toHaveBeenCalledWith('unauthenticated');
	});

	it('holds only 401: a household-required answer is reported at once', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const settle = beginSessionRotation();
		const request = new ApiClient({ fetcher }).get('/api/accounts', parseAny).catch((error: unknown) => error);

		answer(0, 403, { errorCode: 'household-required', message: '', ok: false });
		await request;
		expect(listener).toHaveBeenCalledWith('household-required');
		settle('failed');
	});

	it('never holds longer than the limit: a change that does not settle counts as failed and the 401 is reported', async () => {
		vi.useFakeTimers();

		try {
			const { answer, fetcher } = createControlledFetcher();

			beginSessionRotation();

			const request = new ApiClient({ fetcher }).get('/api/accounts', parseAny).catch((error: unknown) => error);

			answer(0, 401, UNAUTHENTICATED);
			await request;
			await vi.advanceTimersByTimeAsync(SESSION_ROTATION_HOLD_LIMIT_MS - 1);
			expect(listener).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenCalledWith('unauthenticated');
		}
		finally {
			vi.useRealTimers();
		}
	});

	it('reports many held 401s once, and a later settle of the timed-out change changes nothing', async () => {
		vi.useFakeTimers();

		try {
			const { answer, fetcher } = createControlledFetcher();
			const client = new ApiClient({ fetcher });
			const settle = beginSessionRotation();
			const requests = [0, 1, 2].map(() => client.get('/api/accounts', parseAny).catch((error: unknown) => error));

			for (const index of [0, 1, 2]) {
				answer(index, 401, UNAUTHENTICATED);
			}

			await Promise.all(requests);
			await vi.advanceTimersByTimeAsync(SESSION_ROTATION_HOLD_LIMIT_MS);
			expect(listener).toHaveBeenCalledTimes(1);

			settle('rotated');
			expect(listener).toHaveBeenCalledTimes(1);
		}
		finally {
			vi.useRealTimers();
		}
	});

	it('settles once: a second call changes nothing', async () => {
		const { answer, fetcher } = createControlledFetcher();
		const settle = beginSessionRotation();

		settle('failed');
		settle('rotated');

		const request = new ApiClient({ fetcher }).get('/api/accounts', parseAny).catch((error: unknown) => error);

		answer(0, 401, UNAUTHENTICATED);
		await request;
		expect(listener).toHaveBeenCalledWith('unauthenticated');
	});
});

describe('ApiClient delete', () => {
	it('sends DELETE with the session cookie and parses the answer', async () => {
		const fetcher = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		const client = new ApiClient({ fetcher });

		await expect(client.delete('/api/security/sessions/others', parseAny)).resolves.toEqual({ ok: true });
		expect(fetcher).toHaveBeenCalledWith('/api/security/sessions/others', expect.objectContaining({
			body: undefined,
			credentials: 'same-origin',
			method: 'DELETE'
		}));
	});
});
