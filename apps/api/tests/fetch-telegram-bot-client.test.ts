import {
	FetchTelegramBotClient,
	TelegramApiError,
	TelegramForbiddenError,
	TelegramNetworkError,
	TelegramRateLimitedError,
	TelegramSecret,
	TelegramTimeoutError
} from '@/modules/telegram';

import { describe, expect, it, vi } from 'vitest';

const TOKEN = '123456:SECRET-bot-token-value';
const BASE_URL = 'https://telegram.test';

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status });
}

function createClient(fetchMock: FetchMock, requestTimeoutMilliseconds?: number): FetchTelegramBotClient {
	return new FetchTelegramBotClient({
		baseUrl: BASE_URL,
		fetch: fetchMock,
		requestTimeoutMilliseconds,
		token: new TelegramSecret(TOKEN)
	});
}

function lastRequest(fetchMock: FetchMock): { body: Record<string, unknown>; url: string } {
	const call = fetchMock.mock.calls.at(-1);

	if (call === undefined) {
		throw new Error('fetch was not called');
	}

	const [url, init] = call;

	return { body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}'), url: typeof url === 'string' ? url : '' };
}

/** A fetch that never answers but, like the real one, rejects when its signal aborts. */
function hangingFetch(): FetchMock {
	return vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
	}));
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

describe('FetchTelegramBotClient', () => {
	describe('requests', () => {
		it('sendMessage posts JSON to the method URL and returns the message id', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, result: { message_id: 77 } }));

			const result = await createClient(fetchMock).sendMessage({
				chatId: '4242',
				keyboard: [[{ callbackData: 'yes', text: 'Войти' }, { callbackData: 'no', text: 'Это не я' }]],
				text: 'Это вы?'
			});

			expect(result).toEqual({ messageId: 77 });

			const { body, url } = lastRequest(fetchMock);

			expect(url).toBe(`${BASE_URL}/bot${TOKEN}/sendMessage`);
			expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
			expect(body).toEqual({
				chat_id: '4242',
				reply_markup: { inline_keyboard: [[{ callback_data: 'yes', text: 'Войти' }, { callback_data: 'no', text: 'Это не я' }]] },
				text: 'Это вы?'
			});
			expect(body).not.toHaveProperty('parse_mode');
		});

		it('sendMessage without a keyboard sends no reply_markup', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, result: { message_id: 1 } }));

			await createClient(fetchMock).sendMessage({ chatId: 1, text: 'hi' });

			expect(lastRequest(fetchMock).body).toEqual({ chat_id: 1, text: 'hi' });
		});

		it('editMessageText, answerCallbackQuery, setWebhook and deleteWebhook use their methods and fields', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true, result: true })));
			const client = createClient(fetchMock);

			await client.editMessageText({ chatId: 5, messageId: 9, text: 'Готово' });
			expect(lastRequest(fetchMock)).toEqual({
				body: { chat_id: 5, message_id: 9, text: 'Готово' },
				url: `${BASE_URL}/bot${TOKEN}/editMessageText`
			});

			await client.answerCallbackQuery({ callbackQueryId: 'cb1' });
			expect(lastRequest(fetchMock).body).toEqual({ callback_query_id: 'cb1' });

			await client.answerCallbackQuery({ callbackQueryId: 'cb2', text: 'Ок' });
			expect(lastRequest(fetchMock).body).toEqual({ callback_query_id: 'cb2', text: 'Ок' });

			await client.setWebhook({ secretToken: 'hook-secret', url: 'https://app.test/api/telegram/webhook' });
			expect(lastRequest(fetchMock)).toEqual({
				body: {
					allowed_updates: ['message', 'callback_query'],
					secret_token: 'hook-secret',
					url: 'https://app.test/api/telegram/webhook'
				},
				url: `${BASE_URL}/bot${TOKEN}/setWebhook`
			});

			await client.deleteWebhook();
			expect(lastRequest(fetchMock).url).toBe(`${BASE_URL}/bot${TOKEN}/deleteWebhook`);
		});

		it('getUpdates sends offset, timeout and allowed kinds and parses the updates', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
				ok: true,
				result: [
					{
						message: {
							chat: { id: 1, type: 'private' },
							date: 1,
							from: { first_name: 'A', id: 1, is_bot: false },
							message_id: 2
						},
						update_id: 100
					},
					{ update_id: 101 }
				]
			}));

			const updates = await createClient(fetchMock).getUpdates({ offset: 100, timeoutSeconds: 25 });

			expect(updates.map((update) => update.update_id)).toEqual([100, 101]);
			expect(lastRequest(fetchMock).body).toEqual({ allowed_updates: ['message', 'callback_query'], offset: 100, timeout: 25 });
		});

		it('getUpdates keeps a batch alive when one update has a broken message', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
				ok: true,
				result: [{ message: { text: 5 }, update_id: 7 }, { update_id: 8 }]
			}));

			const updates = await createClient(fetchMock).getUpdates({ offset: 0, timeoutSeconds: 0 });

			expect(updates.map((update) => update.update_id)).toEqual([7, 8]);
			expect(updates[0]?.message).toBeUndefined();
		});

		it('getUpdates allows more time than the long poll lasts', async () => {
			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, result: [] }));

			await createClient(fetchMock, 1000).getUpdates({ offset: 0, timeoutSeconds: 25 });

			expect(timeoutSpy).toHaveBeenCalledWith(35_000);
			timeoutSpy.mockRestore();
		});
	});

	describe('Telegram errors', () => {
		it('maps 403 to TelegramForbiddenError', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({ description: 'Forbidden: bot was blocked by the user', error_code: 403, ok: false }, 403)
			);
			const error = await catchError(createClient(fetchMock).sendMessage({ chatId: 1, text: 'x' }));

			expect(error).toBeInstanceOf(TelegramForbiddenError);
			expect(error).toBeInstanceOf(TelegramApiError);
			expect(error).toMatchObject({ description: 'Forbidden: bot was blocked by the user', errorCode: 403, method: 'sendMessage' });
		});

		it('maps 429 to TelegramRateLimitedError with retry_after', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
				description: 'Too Many Requests: retry after 17',
				error_code: 429,
				ok: false,
				parameters: { retry_after: 17 }
			}, 429));
			const error = await catchError(createClient(fetchMock).sendMessage({ chatId: 1, text: 'x' }));

			expect(error).toBeInstanceOf(TelegramRateLimitedError);
			expect(error).toMatchObject({ errorCode: 429, retryAfterSeconds: 17 });
		});

		it('falls back to one second when 429 carries no retry_after', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({ description: 'Too Many Requests', error_code: 429, ok: false }, 429)
			);
			const error = await catchError(createClient(fetchMock).sendMessage({ chatId: 1, text: 'x' }));

			expect(error).toMatchObject({ retryAfterSeconds: 1 });
		});

		it('maps any other failure to TelegramApiError with its code and description', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({ description: 'Bad Request: message is not modified', error_code: 400, ok: false }, 400)
			);
			const error = await catchError(createClient(fetchMock).editMessageText({ chatId: 1, messageId: 1, text: 'x' }));

			expect(error).toBeInstanceOf(TelegramApiError);
			expect(error).not.toBeInstanceOf(TelegramForbiddenError);
			expect(error).not.toBeInstanceOf(TelegramRateLimitedError);
			expect(error).toMatchObject({ description: 'Bad Request: message is not modified', errorCode: 400 });
		});

		it('reports 409 (another getUpdates consumer) with its code so that callers can recognise it', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({ description: 'Conflict: terminated by other getUpdates request', error_code: 409, ok: false }, 409)
			);
			const error = await catchError(createClient(fetchMock).getUpdates({ offset: 0, timeoutSeconds: 0 }));

			expect(error).toMatchObject({ errorCode: 409 });
		});

		it('turns a non-JSON answer (a proxy error page) into TelegramApiError without echoing the body', async () => {
			const page = new Response('<html>Bad gateway bot123456:SECRET</html>', { status: 502 });
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(page);
			const error = await catchError(createClient(fetchMock).deleteWebhook());

			expect(error).toBeInstanceOf(TelegramApiError);
			expect(error).toMatchObject({ errorCode: 502 });
			expect(String((error as Error).message)).not.toContain('Bad gateway');
		});

		it('rejects an answer that is JSON but not a Bot API response', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ hello: 'world' }));

			expect(await catchError(createClient(fetchMock).deleteWebhook())).toBeInstanceOf(TelegramApiError);
		});

		it('rejects an ok answer whose result has the wrong shape', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, result: { message_id: 'seven' } }));

			expect(await catchError(createClient(fetchMock).sendMessage({ chatId: 1, text: 'x' }))).toBeInstanceOf(TelegramApiError);
		});
	});

	describe('transport', () => {
		it('times out with TelegramTimeoutError', async () => {
			const error = await catchError(createClient(hangingFetch(), 30).sendMessage({ chatId: 1, text: 'x' }));

			expect(error).toBeInstanceOf(TelegramTimeoutError);
			expect(error).toMatchObject({ method: 'sendMessage' });
		});

		it('passes an abort signal to fetch', async () => {
			const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true, result: true }));

			await createClient(fetchMock).deleteWebhook();

			expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
		});

		it('aborts a long poll when the caller aborts, as a network error and not as a timeout', async () => {
			const controller = new AbortController();
			const pending = catchError(createClient(hangingFetch(), 5000).getUpdates({
				offset: 0,
				signal: controller.signal,
				timeoutSeconds: 25
			}));

			controller.abort();

			const error = await pending;

			expect(error).toBeInstanceOf(TelegramNetworkError);
			expect(error).not.toBeInstanceOf(TelegramTimeoutError);
		});

		it('wraps a connection failure without keeping its message, which may quote the URL with the token', async () => {
			const cause = Object.assign(new Error(`connect ECONNREFUSED ${BASE_URL}/bot${TOKEN}/sendMessage`), { code: 'ECONNREFUSED' });
			const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed', { cause }));
			const error = await catchError(createClient(fetchMock).sendMessage({ chatId: 1, text: 'x' }));

			expect(error).toBeInstanceOf(TelegramNetworkError);
			expect((error as Error).message).toContain('ECONNREFUSED');
			expect((error as Error).message).not.toContain(TOKEN);
			expect((error as Error).cause).toBeUndefined();
		});
	});

	describe('the token never leaks', () => {
		it('through any error raised by the client', async () => {
			const failures: FetchMock[] = [
				vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ description: 'Forbidden', error_code: 403, ok: false }, 403)),
				vi.fn<typeof fetch>().mockResolvedValue(
					jsonResponse({ description: 'Slow down', error_code: 429, ok: false, parameters: { retry_after: 3 } }, 429)
				),
				vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ description: 'Bad', error_code: 400, ok: false }, 400)),
				vi.fn<typeof fetch>().mockResolvedValue(new Response('oops', { status: 500 })),
				vi.fn<typeof fetch>().mockRejectedValue(new Error(`failed ${BASE_URL}/bot${TOKEN}/sendMessage`)),
				hangingFetch()
			];

			for (const fetchMock of failures) {
				const error = await catchError(createClient(fetchMock, 20).sendMessage({ chatId: 1, text: 'x' })) as Error;

				expect(`${error.name} ${error.message} ${error.stack ?? ''} ${JSON.stringify(error)}`).not.toContain(TOKEN);
				expect(error.cause).toBeUndefined();
			}
		});
	});
});
