import { createApiApp } from '@/app';
import { TelegramWebhookHttpController } from '@/http/telegram-webhook-controller';
import {
	ProcessedUpdateIds,
	TelegramSecret,
	type TelegramUpdate,
	TelegramUpdateDispatcher,
	type TelegramUpdateHandler
} from '@/modules/telegram';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'webhook-secret-for-tests-0123456789';
const URL_PATH = '/api/telegram/webhook';

class RecordingHandler implements TelegramUpdateHandler {
	public readonly received: TelegramUpdate[] = [];
	public failure: Error | undefined;

	public handle(update: TelegramUpdate): Promise<void> {
		this.received.push(update);

		return this.failure === undefined ? Promise.resolve() : Promise.reject(this.failure);
	}
}

function messageUpdate(updateId: number): Record<string, unknown> {
	return {
		message: {
			chat: { id: 4242, type: 'private' },
			date: 1_760_000_000,
			from: { first_name: 'Anna', id: 4242, is_bot: false },
			message_id: 7,
			text: '/start abc'
		},
		update_id: updateId
	};
}

describe('POST /api/telegram/webhook', () => {
	let handler: RecordingHandler;
	let app: ReturnType<typeof createApiApp>;

	const post = (body: BodyInit, headers: Record<string, string> = {}) => app.request(URL_PATH, {
		body,
		headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET, ...headers },
		method: 'POST'
	});

	beforeEach(() => {
		handler = new RecordingHandler();
		app = createApiApp({
			telegramWebhookController: new TelegramWebhookHttpController({
				bodyLimitBytes: 1024,
				dispatcher: new TelegramUpdateDispatcher(handler, new ProcessedUpdateIds()),
				secret: new TelegramSecret(SECRET)
			})
		});
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes a valid update to the handler and answers 200 without data', async () => {
		const response = await post(JSON.stringify(messageUpdate(1)));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(handler.received).toHaveLength(1);
		expect(handler.received[0]?.message?.text).toBe('/start abc');
	});

	it('hands over callback queries', async () => {
		const response = await post(JSON.stringify({
			callback_query: { data: 'confirm', from: { first_name: 'Anna', id: 4242, is_bot: false }, id: 'cb1' },
			update_id: 2
		}));

		expect(response.status).toBe(200);
		expect(handler.received[0]?.callback_query?.from.id).toBe(4242);
	});

	describe('secret', () => {
		it.each([
			['a wrong secret', { 'x-telegram-bot-api-secret-token': 'wrong-secret' }],
			['a secret of a different length', { 'x-telegram-bot-api-secret-token': 'x' }],
			['an empty secret', { 'x-telegram-bot-api-secret-token': '' }],
			['the secret as a prefix only', { 'x-telegram-bot-api-secret-token': SECRET.slice(0, -1) }],
			['the secret with a suffix', { 'x-telegram-bot-api-secret-token': `${SECRET}x` }]
		])('rejects %s with 401 and never reaches the handler', async (_name, headers) => {
			const response = await post(JSON.stringify(messageUpdate(10)), headers);

			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized.' }, ok: false });
			expect(handler.received).toHaveLength(0);
		});

		it('rejects a request without the header', async () => {
			const response = await app.request(URL_PATH, { body: JSON.stringify(messageUpdate(11)), method: 'POST' });

			expect(response.status).toBe(401);
			expect(handler.received).toHaveLength(0);
		});

		it('checks the secret before reading the body', async () => {
			const response = await post('{not json', { 'x-telegram-bot-api-secret-token': 'wrong' });

			expect(response.status).toBe(401);
		});

		it('does not answer to other methods', async () => {
			const response = await app.request(URL_PATH, { headers: { 'x-telegram-bot-api-secret-token': SECRET }, method: 'GET' });

			expect(response.status).toBe(404);
		});
	});

	describe('de-duplication', () => {
		it('handles a redelivered update_id once and still answers 200', async () => {
			const first = await post(JSON.stringify(messageUpdate(20)));
			const second = await post(JSON.stringify(messageUpdate(20)));

			expect(first.status).toBe(200);
			expect(second.status).toBe(200);
			expect(handler.received).toHaveLength(1);
		});

		it('handles different update ids separately', async () => {
			await post(JSON.stringify(messageUpdate(21)));
			await post(JSON.stringify(messageUpdate(22)));

			expect(handler.received.map((update) => update.update_id)).toEqual([21, 22]);
		});

		it('does not handle an update again after the handler failed', async () => {
			handler.failure = new Error('boom');

			const first = await post(JSON.stringify(messageUpdate(23)));
			const second = await post(JSON.stringify(messageUpdate(23)));

			expect(first.status).toBe(200);
			expect(second.status).toBe(200);
			expect(handler.received).toHaveLength(1);
		});

		it('does not remember updates sent with a wrong secret', async () => {
			await post(JSON.stringify(messageUpdate(24)), { 'x-telegram-bot-api-secret-token': 'wrong' });
			const genuine = await post(JSON.stringify(messageUpdate(24)));

			expect(genuine.status).toBe(200);
			expect(handler.received).toHaveLength(1);
		});
	});

	describe('handler failure', () => {
		it('is logged and answered with 200 so that Telegram does not redeliver', async () => {
			handler.failure = new Error('boom');

			const response = await post(JSON.stringify(messageUpdate(30)));

			expect(response.status).toBe(200);
			expect(console.error).toHaveBeenCalled();
		});
	});

	describe('body', () => {
		it('rejects a body over the limit with 413 before the handler', async () => {
			const oversized = JSON.stringify({ ...messageUpdate(40), padding: 'x'.repeat(2048) });
			const response = await post(oversized, { 'content-length': String(oversized.length) });

			expect(response.status).toBe(413);
			expect(handler.received).toHaveLength(0);
		});

		it('rejects an oversized body that arrives without Content-Length', async () => {
			const oversized = JSON.stringify({ ...messageUpdate(41), padding: 'x'.repeat(2048) });
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(oversized));
					controller.close();
				}
			});
			const response = await app.request(URL_PATH, {
				body: stream,
				duplex: 'half',
				headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': SECRET },
				method: 'POST'
			} as RequestInit);

			expect(response.status).toBeGreaterThanOrEqual(400);
			expect(handler.received).toHaveLength(0);
		});

		it.each([
			['not JSON', '{nope'],
			['an array', '[]'],
			['a string', '"hello"'],
			['no update_id', JSON.stringify({ message: messageUpdate(1).message })],
			['a text update_id', JSON.stringify({ ...messageUpdate(1), update_id: 'one' })],
			['a negative update_id', JSON.stringify({ ...messageUpdate(1), update_id: -1 })],
			['a fractional update_id', JSON.stringify({ ...messageUpdate(1), update_id: 1.5 })]
		])('rejects %s with 400 and no details', async (_name, body) => {
			const response = await post(body);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				error: { code: 'invalid_update', message: 'The request body is not a valid update.' },
				ok: false
			});
			expect(handler.received).toHaveLength(0);
		});

		it('ignores an update whose message has the wrong shape instead of failing the whole delivery', async () => {
			const response = await post(JSON.stringify({ message: { text: 5 }, update_id: 50 }));

			expect(response.status).toBe(200);
			expect(handler.received).toHaveLength(0);
		});

		it('ignores an update of a kind the bot does not read', async () => {
			const response = await post(JSON.stringify({ edited_message: {}, update_id: 51 }));

			expect(response.status).toBe(200);
			expect(handler.received).toHaveLength(0);
		});
	});

	it('is not mounted when no controller is given (modes off and polling)', async () => {
		const response = await createApiApp().request(URL_PATH, {
			body: JSON.stringify(messageUpdate(60)),
			headers: { 'x-telegram-bot-api-secret-token': SECRET },
			method: 'POST'
		});

		expect(response.status).toBe(404);
	});
});
