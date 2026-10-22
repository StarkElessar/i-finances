import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
	FetchTelegramBotClient,
	type FetchTelegramBotClientOptions,
	TelegramApiError,
	TelegramForbiddenError,
	TelegramNetworkError,
	TelegramRateLimitedError,
	TelegramSecret,
	TelegramTimeoutError
} from '@/modules/telegram';

import { afterEach, describe, expect, it, vi } from 'vitest';

const TOKEN = '123456:SECRET-bot-token-value';
const TEXT = 'private message text 4242';
const BASE_URL = 'https://telegram.test';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;
type RetryConnection = NonNullable<FetchTelegramBotClientOptions['createRetryConnection']> extends () => infer R ? R : never;

const OK_SENT = { ok: true, result: { message_id: 77 } };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

function rateLimited(retryAfter?: number): Response {
	return jsonResponse({
		description: 'Too Many Requests',
		error_code: 429,
		ok: false,
		...(retryAfter === undefined ? {} : { parameters: { retry_after: retryAfter } })
	}, 429);
}

/** An attempt that never answers but, like the real fetch, rejects when its signal aborts: a socket that went dead. */
function hang(init: RequestInit | undefined): Promise<Response> {
	return new Promise((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
	});
}

function connectionError(): Error {
	const cause = Object.assign(new Error(`read ECONNRESET ${BASE_URL}/bot${TOKEN}/sendMessage`), { code: 'ECONNRESET' });

	return new TypeError('fetch failed', { cause });
}

/** Plays the given steps, one per fetch call; the last step repeats. */
function scriptedFetch(...steps: ('hang' | 'network' | Response)[]): FetchMock {
	let call = 0;

	return vi.fn<typeof fetch>((_url, init) => {
		const step = steps[Math.min(call, steps.length - 1)];

		call += 1;

		if (step === 'hang') {
			return hang(init);
		}

		if (step === 'network') {
			return Promise.reject(connectionError());
		}

		return Promise.resolve(step.clone());
	});
}

type TestClient = {
	client: FetchTelegramBotClient;
	connections: RetryConnection[];
	logs: string[];
};

/** Short timeouts and pauses, real clock. `createRetryConnection` hands out markers instead of undici pools. */
function createClient(fetchMock: FetchMock, overrides: Partial<FetchTelegramBotClientOptions> = {}): TestClient {
	const logs: string[] = [];
	const connections: RetryConnection[] = [];
	const client = new FetchTelegramBotClient({
		baseUrl: BASE_URL,
		createRetryConnection: () => {
			const connection: RetryConnection = {
				close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
				dispatcher: { retry: connections.length + 1 } as unknown as RetryConnection['dispatcher']
			};

			connections.push(connection);

			return connection;
		},
		fetch: fetchMock,
		log: (line) => logs.push(line),
		requestTimeoutMilliseconds: 30,
		retryBackoffMilliseconds: [5, 10],
		token: new TelegramSecret(TOKEN),
		totalBudgetMilliseconds: 5000,
		...overrides
	});

	return { client, connections, logs };
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	}
	catch (error) {
		return error;
	}

	throw new Error('the promise was expected to reject');
}

function send(client: FetchTelegramBotClient): Promise<{ messageId: number }> {
	return client.sendMessage({ chatId: 1, text: TEXT });
}

describe('FetchTelegramBotClient retries', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('timeouts and network errors', () => {
		it('a timeout on the first attempt, then success: one retry', async () => {
			const fetchMock = scriptedFetch('hang', jsonResponse(OK_SENT));
			const { client, logs } = createClient(fetchMock);

			expect(await send(client)).toEqual({ messageId: 77 });
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(logs).toEqual(['Telegram sendMessage attempt 1 of 3 failed (TelegramTimeoutError), retrying in 5 ms.']);
		});

		it('two timeouts, then success on the third attempt', async () => {
			const fetchMock = scriptedFetch('hang', 'hang', jsonResponse(OK_SENT));
			const { client, logs } = createClient(fetchMock);

			expect(await send(client)).toEqual({ messageId: 77 });
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(logs).toHaveLength(2);
		});

		it('three timeouts end with TelegramTimeoutError, as before the retries existed', async () => {
			const fetchMock = scriptedFetch('hang');
			const { client } = createClient(fetchMock);
			const error = await catchError(send(client));

			expect(error).toBeInstanceOf(TelegramTimeoutError);
			expect(error).toMatchObject({ method: 'sendMessage' });
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});

		it('a network error is retried the same way, and three of them end with TelegramNetworkError', async () => {
			const recovering = scriptedFetch('network', jsonResponse(OK_SENT));

			expect(await send(createClient(recovering).client)).toEqual({ messageId: 77 });
			expect(recovering).toHaveBeenCalledTimes(2);

			const broken = scriptedFetch('network');
			const { client, logs } = createClient(broken);
			const error = await catchError(send(client));

			expect(error).toBeInstanceOf(TelegramNetworkError);
			expect(error).toMatchObject({ code: 'ECONNRESET' });
			expect(broken).toHaveBeenCalledTimes(3);
			expect(logs[0]).toBe('Telegram sendMessage attempt 1 of 3 failed (TelegramNetworkError, ECONNRESET), retrying in 5 ms.');
		});

		it('every ordinary method retries; the pauses grow as configured', async () => {
			const fetchMock = scriptedFetch('network', jsonResponse({ ok: true, result: true }));
			const { client, logs } = createClient(fetchMock);

			await client.answerCallbackQuery({ callbackQueryId: 'cb' });
			await client.editMessageText({ chatId: 1, messageId: 2, text: TEXT });
			await client.setWebhook({ secretToken: 's', url: 'https://app.test/hook' });
			await client.deleteWebhook();

			// Each call starts from attempt 1; the scripted fetch is on its last (successful) step after the first call.
			expect(logs).toHaveLength(1);

			const slow = scriptedFetch('network', 'network', jsonResponse({ ok: true, result: true }));
			const second = createClient(slow);

			await second.client.deleteWebhook();
			expect(second.logs.map((line) => line.match(/retrying in (\d+) ms/u)?.[1])).toEqual(['5', '10']);
		});

		it('does not retry when maxRetries is 0', async () => {
			const fetchMock = scriptedFetch('hang');
			const error = await catchError(send(createClient(fetchMock, { maxRetries: 0 }).client));

			expect(error).toBeInstanceOf(TelegramTimeoutError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('getUpdates is never retried by the client; the polling loop owns that', async () => {
			const fetchMock = scriptedFetch('network');
			const { client, connections } = createClient(fetchMock);
			const error = await catchError(client.getUpdates({ offset: 0, timeoutSeconds: 0 }));

			expect(error).toBeInstanceOf(TelegramNetworkError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(connections).toHaveLength(0);
		});

		it('getUpdates keeps its long poll timeout', async () => {
			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
			const { client } = createClient(scriptedFetch(jsonResponse({ ok: true, result: [] })));

			await client.getUpdates({ offset: 0, timeoutSeconds: 25 });

			expect(timeoutSpy).toHaveBeenCalledWith(35_000);
		});
	});

	describe('answers that are final', () => {
		it('403 is not retried', async () => {
			const fetchMock = scriptedFetch(jsonResponse({ description: 'Forbidden: bot was blocked', error_code: 403, ok: false }, 403));
			const { client, logs } = createClient(fetchMock);

			expect(await catchError(send(client))).toBeInstanceOf(TelegramForbiddenError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(logs).toEqual([]);
		});

		it('400, 409, 5xx pages and a wrong shape are not retried', async () => {
			const answers = [
				jsonResponse({ description: 'Bad Request', error_code: 400, ok: false }, 400),
				jsonResponse({ description: 'Conflict', error_code: 409, ok: false }, 409),
				new Response('<html>Bad gateway</html>', { status: 502 }),
				jsonResponse({ ok: true, result: { message_id: 'seven' } })
			];

			for (const answer of answers) {
				const fetchMock = scriptedFetch(answer);
				const error = await catchError(send(createClient(fetchMock).client));

				expect(error).toBeInstanceOf(TelegramApiError);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			}
		});
	});

	describe('429', () => {
		it('waits retry_after (here 3 s) and then succeeds', async () => {
			vi.useFakeTimers();

			const fetchMock = scriptedFetch(rateLimited(3), jsonResponse(OK_SENT));
			const pending = send(createClient(fetchMock).client);

			await vi.advanceTimersByTimeAsync(2999);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);
			expect(await pending).toEqual({ messageId: 77 });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it('never waits less than the backoff, even for retry_after 0 or a missing one (1 s fallback)', async () => {
			vi.useFakeTimers();

			const zero = scriptedFetch(rateLimited(0), jsonResponse(OK_SENT));
			const pending = send(createClient(zero, { retryBackoffMilliseconds: [200, 600] }).client);

			await vi.advanceTimersByTimeAsync(199);
			expect(zero).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			await pending;
			expect(zero).toHaveBeenCalledTimes(2);

			const missing = scriptedFetch(rateLimited(), jsonResponse(OK_SENT));
			const pendingMissing = send(createClient(missing).client);

			await vi.advanceTimersByTimeAsync(999);
			expect(missing).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			await pendingMissing;
			expect(missing).toHaveBeenCalledTimes(2);
		});

		it('a retry_after above the limit is not waited out: TelegramRateLimitedError at once', async () => {
			const fetchMock = scriptedFetch(rateLimited(6));
			const startedAt = Date.now();
			// The budget is large on purpose: only the limit on retry_after may stop the retry.
			const error = await catchError(send(createClient(fetchMock, { totalBudgetMilliseconds: 60_000 }).client));

			expect(error).toBeInstanceOf(TelegramRateLimitedError);
			expect(error).toMatchObject({ retryAfterSeconds: 6 });
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(Date.now() - startedAt).toBeLessThan(500);
		});

		it('a retry_after that does not fit into the remaining budget is not waited out', async () => {
			const fetchMock = scriptedFetch(rateLimited(4));
			const error = await catchError(send(createClient(fetchMock, { totalBudgetMilliseconds: 4000 }).client));

			expect(error).toBeInstanceOf(TelegramRateLimitedError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it('keeps answering 429: the retries run out and the last 429 reaches the caller', async () => {
			vi.useFakeTimers();

			const fetchMock = scriptedFetch(rateLimited(1));
			const pending = catchError(send(createClient(fetchMock).client));

			await vi.advanceTimersByTimeAsync(2000);

			expect(await pending).toBeInstanceOf(TelegramRateLimitedError);
			expect(fetchMock).toHaveBeenCalledTimes(3);
		});
	});

	describe('the time budget', () => {
		it('with the defaults one attempt is 4 s, the pauses are 200 and 600 ms', async () => {
			vi.useFakeTimers();

			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
			const fetchMock = scriptedFetch('network', 'network', jsonResponse(OK_SENT));
			const logs: string[] = [];
			const client = new FetchTelegramBotClient({
				baseUrl: BASE_URL,
				createRetryConnection: () => ({ close: () => Promise.resolve(), dispatcher: {} as RetryConnection['dispatcher'] }),
				fetch: fetchMock,
				log: (line) => logs.push(line),
				token: new TelegramSecret(TOKEN)
			});
			const pending = send(client);

			await vi.advanceTimersByTimeAsync(800);
			await pending;

			expect(timeoutSpy.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([4000, 4000, 4000]);
			expect(logs.map((line) => line.match(/retrying in (\d+) ms/u)?.[1])).toEqual(['200', '600']);
		});

		it('the last attempt gets only what is left, so the whole call stays within 12 s', async () => {
			vi.useFakeTimers();

			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
			const startedAt = Date.now();
			// Every attempt runs until its timeout: the mock advances the clock by the timeout it was given.
			const fetchMock = vi.fn<typeof fetch>(() => {
				const milliseconds = timeoutSpy.mock.calls.at(-1)?.[0] ?? 0;

				vi.setSystemTime(Date.now() + milliseconds);

				return Promise.reject(connectionError());
			});
			const client = new FetchTelegramBotClient({
				baseUrl: BASE_URL,
				createRetryConnection: () => ({ close: () => Promise.resolve(), dispatcher: {} as RetryConnection['dispatcher'] }),
				fetch: fetchMock,
				log: () => undefined,
				token: new TelegramSecret(TOKEN)
			});
			const pending = catchError(send(client));

			await vi.advanceTimersByTimeAsync(800);

			expect(await pending).toBeInstanceOf(TelegramNetworkError);
			// 4000 + 200 pause + 4000 + 600 pause leaves 3200 for the third attempt.
			expect(timeoutSpy.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([4000, 4000, 3200]);
			expect(Date.now() - startedAt).toBeLessThanOrEqual(12_000);
		});

		it('stops retrying once a pause would leave nothing for the next attempt (real clock)', async () => {
			const fetchMock = scriptedFetch('hang');
			const startedAt = Date.now();
			const error = await catchError(send(createClient(fetchMock, {
				requestTimeoutMilliseconds: 50,
				retryBackoffMilliseconds: [10, 10],
				totalBudgetMilliseconds: 70
			}).client));

			expect(error).toBeInstanceOf(TelegramTimeoutError);
			// 50 + 10 leaves 10 ms for the second attempt; its pause (10) would leave nothing.
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(Date.now() - startedAt).toBeLessThan(70 + 80);
		});
	});

	describe('a retry gets a new connection', () => {
		it('the first attempt uses the shared pool, every retry its own, and each pool is closed', async () => {
			const fetchMock = scriptedFetch('hang', 'hang', jsonResponse(OK_SENT));
			const { client, connections } = createClient(fetchMock);

			await send(client);

			const dispatchers = fetchMock.mock.calls.map(([, init]) => (init as { dispatcher?: unknown } | undefined)?.dispatcher);

			expect(dispatchers[0]).toBeUndefined();
			expect(connections).toHaveLength(2);
			expect(dispatchers[1]).toBe(connections[0]?.dispatcher);
			expect(dispatchers[2]).toBe(connections[1]?.dispatcher);
			expect(dispatchers[1]).not.toBe(dispatchers[2]);

			for (const connection of connections) {
				expect(connection.close).toHaveBeenCalledTimes(1);
			}
		});

		it('opens no pool when the first attempt succeeds', async () => {
			const { client, connections } = createClient(scriptedFetch(jsonResponse(OK_SENT)));

			await send(client);

			expect(connections).toHaveLength(0);
		});

		it('closes the pool of a retry that failed too', async () => {
			const { client, connections } = createClient(scriptedFetch('network'));

			await catchError(send(client));

			expect(connections).toHaveLength(2);

			for (const connection of connections) {
				expect(connection.close).toHaveBeenCalledTimes(1);
			}
		});
	});

	describe('the token and the text never leak', () => {
		it('not through errors, not through the retry log, not through console.warn', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
			const failures: FetchMock[] = [
				scriptedFetch('hang'),
				scriptedFetch('network'),
				scriptedFetch(rateLimited(0)),
				scriptedFetch(jsonResponse({ description: 'Forbidden', error_code: 403, ok: false }, 403)),
				scriptedFetch(new Response(`oops bot${TOKEN}`, { status: 500 }))
			];

			for (const fetchMock of failures) {
				const logs: string[] = [];
				const { client } = createClient(fetchMock, { log: (line) => logs.push(line) });
				const error = await catchError(send(client)) as Error;

				expect(`${error.name} ${error.message} ${error.stack ?? ''} ${JSON.stringify(error)}`).not.toContain(TOKEN);
				expect(error.cause).toBeUndefined();
				expect(logs.join('\n')).not.toContain(TOKEN);
				expect(logs.join('\n')).not.toContain(TEXT);
				expect(logs.join('\n')).not.toContain('http');
			}

			// The default logger is console.warn.
			const { client } = createClient(scriptedFetch('network', jsonResponse(OK_SENT)), { log: undefined });

			await send(client);

			expect(warn).toHaveBeenCalledTimes(1);
			expect(String(warn.mock.calls[0]?.[0])).toContain('sendMessage');
			expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
			expect(JSON.stringify(warn.mock.calls)).not.toContain(TEXT);
		});
	});
});

describe('FetchTelegramBotClient retries over real sockets', () => {
	let server: Server | undefined;

	afterEach(async () => {
		server?.closeAllConnections();
		await new Promise<void>((resolve) => {
			if (server === undefined) {
				resolve();

				return;
			}

			server.close(() => resolve());
		});
		server = undefined;
	});

	it('the retry reaches a live server on a socket of its own, and the private pool is closed afterwards', async () => {
		const sockets = new Map<number, { closed: boolean }>();
		const requestPorts: number[] = [];

		server = createServer((request: IncomingMessage, response: ServerResponse) => {
			requestPorts.push(request.socket.remotePort ?? -1);

			// The 2nd request is a dead end: the server never answers it, like a socket that went silent.
			if (requestPorts.length === 2) {
				return;
			}

			request.resume();
			response.setHeader('content-type', 'application/json');
			response.end(JSON.stringify(OK_SENT));
		});
		server.on('connection', (socket) => {
			const record = { closed: false };

			sockets.set(socket.remotePort ?? -1, record);
			socket.on('close', () => {
				record.closed = true;
			});
		});
		await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));

		const { port } = server.address() as AddressInfo;
		// The real `fetch` and the real undici `Agent` of the default retry connection.
		const client = new FetchTelegramBotClient({
			baseUrl: `http://127.0.0.1:${port}`,
			log: () => undefined,
			requestTimeoutMilliseconds: 300,
			retryBackoffMilliseconds: [5, 5],
			token: new TelegramSecret(TOKEN)
		});

		expect(await send(client)).toEqual({ messageId: 77 });
		// Request 2 hangs on the shared pool and times out; request 3 is the retry.
		expect(await send(client)).toEqual({ messageId: 77 });

		expect(requestPorts).toHaveLength(3);

		const [firstPort, hungPort, retryPort] = requestPorts;

		expect(retryPort).not.toBe(firstPort);
		expect(retryPort).not.toBe(hungPort);

		// The private pool is destroyed once the retry is done: its socket closes by itself.
		await vi.waitFor(() => expect(sockets.get(retryPort)?.closed).toBe(true));
	});
});
