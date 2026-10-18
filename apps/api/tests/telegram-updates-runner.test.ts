import {
	ProcessedUpdateIds,
	TelegramApiError,
	TelegramRateLimitedError,
	TelegramSecret,
	type TelegramUpdate,
	TelegramUpdateDispatcher,
	type TelegramUpdateHandler,
	TelegramUpdatesRunner
} from '@/modules/telegram';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeTelegramBotClient } from './support/fake-telegram-bot-client';

class CollectingHandler implements TelegramUpdateHandler {
	public readonly ids: number[] = [];

	public handle(update: TelegramUpdate): Promise<void> {
		this.ids.push(update.update_id);

		return Promise.resolve();
	}
}

function textUpdate(updateId: number): TelegramUpdate {
	return {
		callback_query: undefined,
		message: { chat: { id: 1, type: 'private' }, date: 1, from: { first_name: 'A', id: 1, is_bot: false }, message_id: updateId },
		update_id: updateId
	};
}

async function waitUntil(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}

	expect(condition()).toBe(true);
}

describe('TelegramUpdatesRunner', () => {
	let bot: FakeTelegramBotClient;
	let handler: CollectingHandler;
	let dispatcher: TelegramUpdateDispatcher;

	const createRunner = (mode: 'off' | 'polling' | 'webhook') => new TelegramUpdatesRunner({
		botClient: bot,
		dispatcher,
		longPollSeconds: 1,
		mode,
		retryDelayMilliseconds: 5,
		webhook: { secret: new TelegramSecret('hook-secret'), url: 'https://app.test/api/telegram/webhook' }
	});

	beforeEach(() => {
		bot = new FakeTelegramBotClient();
		handler = new CollectingHandler();
		dispatcher = new TelegramUpdateDispatcher(handler, new ProcessedUpdateIds());
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('mode off touches nothing', async () => {
		const runner = createRunner('off');

		runner.start();
		await runner.stop();

		expect(bot.calls).toEqual([]);
	});

	it('webhook mode registers the webhook with the secret token and does not poll', async () => {
		const runner = createRunner('webhook');

		runner.start();
		await runner.stop();

		expect(bot.calls).toEqual([
			{ input: { secretToken: 'hook-secret', url: 'https://app.test/api/telegram/webhook' }, method: 'setWebhook' }
		]);
	});

	it('webhook mode retries registration in the background instead of failing the start', async () => {
		bot.failNext('setWebhook', new TelegramApiError('setWebhook', 502, 'bad gateway'));
		bot.failNext('setWebhook', new Error('network down'));

		const runner = createRunner('webhook');

		runner.start();
		await waitUntil(() => bot.callsTo('setWebhook').length === 3);
		await runner.stop();

		expect(console.error).toHaveBeenCalledTimes(2);
	});

	it('webhook mode without a webhook URL and secret is refused', () => {
		expect(() => new TelegramUpdatesRunner({ botClient: bot, dispatcher, mode: 'webhook' })).toThrow();
	});

	it('polling mode dispatches updates and advances the offset, and never deletes a webhook', async () => {
		bot.queueUpdates(textUpdate(10), textUpdate(11));

		const runner = createRunner('polling');

		runner.start();
		await waitUntil(() => bot.callsTo('getUpdates').length >= 2);
		await runner.stop();

		// Deleting the webhook would let a developer machine with the production token take the bot over.
		expect(bot.callsTo('deleteWebhook')).toHaveLength(0);
		expect(bot.calls[0]?.method).toBe('getUpdates');
		expect(handler.ids).toEqual([10, 11]);
		expect(bot.callsTo('getUpdates').map((call) => call.input.offset)).toEqual([0, 12]);
	});

	it('polling does not hand an update to the handler twice', async () => {
		bot.queueUpdates(textUpdate(20), textUpdate(20));

		const runner = createRunner('polling');

		runner.start();
		await waitUntil(() => bot.callsTo('getUpdates').length >= 2);
		await runner.stop();

		expect(handler.ids).toEqual([20]);
	});

	it('polling survives a failed getUpdates and a rate limit, then carries on', async () => {
		bot.failNext('getUpdates', new Error('socket hang up'));
		bot.failNext('getUpdates', new TelegramRateLimitedError('getUpdates', 'Too Many Requests', 0));
		bot.queueUpdates(textUpdate(30));

		const runner = createRunner('polling');

		runner.start();
		await waitUntil(() => handler.ids.length === 1);
		await runner.stop();

		expect(handler.ids).toEqual([30]);
		expect(console.error).toHaveBeenCalledTimes(2);
	});

	it('names the cause when another consumer holds the updates (409) and keeps the webhook', async () => {
		const conflict = new TelegramApiError('getUpdates', 409, "Conflict: can't use getUpdates method while webhook is active");

		bot.failNext('getUpdates', conflict);

		const runner = createRunner('polling');

		runner.start();
		await waitUntil(() => bot.callsTo('getUpdates').length >= 2);
		await runner.stop();

		expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain('Another consumer');
		expect(bot.callsTo('deleteWebhook')).toHaveLength(0);
	});

	it('stop() ends a long poll that is waiting and aborts its signal', async () => {
		const runner = createRunner('polling');

		runner.start();
		await waitUntil(() => bot.callsTo('getUpdates').length === 1);

		const signal = bot.callsTo('getUpdates')[0]?.input.signal;

		await runner.stop();

		expect(signal?.aborted).toBe(true);
		expect(bot.callsTo('getUpdates')).toHaveLength(1);
	});

	it('stop() also ends the wait between retries', async () => {
		bot.failNext('getUpdates', new Error('down'));

		const runner = new TelegramUpdatesRunner({ botClient: bot, dispatcher, mode: 'polling', retryDelayMilliseconds: 60_000 });

		runner.start();
		await waitUntil(() => bot.callsTo('getUpdates').length === 1);
		await runner.stop();

		expect(bot.callsTo('getUpdates')).toHaveLength(1);
	});
});
