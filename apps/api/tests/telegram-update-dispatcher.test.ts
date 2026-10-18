import { ProcessedUpdateIds, type TelegramUpdate, TelegramUpdateDispatcher } from '@/modules/telegram';

import { describe, expect, it, vi } from 'vitest';

const update = (updateId: number): TelegramUpdate => ({
	message: { chat: { id: 1, type: 'private' }, date: 0, message_id: 1, text: '/start' },
	update_id: updateId
});

describe('TelegramUpdateDispatcher.drain (shutdown)', () => {
	it('returns at once when nothing runs', async () => {
		const dispatcher = new TelegramUpdateDispatcher({ handle: async () => undefined }, new ProcessedUpdateIds());

		expect(await dispatcher.drain(10)).toBe(true);
	});

	it('waits for a handler that is still running, failing ones included', async () => {
		let finish: () => void = () => undefined;
		const finished = vi.fn();
		const dispatcher = new TelegramUpdateDispatcher({
			handle: (incoming) => incoming.update_id === 1
				? new Promise<void>((resolve) => {
					finish = () => {
						finished();
						resolve();
					};
				})
				: Promise.reject(new Error('boom'))
		}, new ProcessedUpdateIds());

		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const slow = dispatcher.dispatch(update(1));

		await dispatcher.dispatch(update(2));

		const drained = dispatcher.drain(5_000);

		setTimeout(() => finish(), 20);

		expect(await drained).toBe(true);
		expect(finished).toHaveBeenCalledOnce();
		expect(await slow).toBe('handled');
		vi.restoreAllMocks();
	});

	it('gives up after the timeout when a handler hangs', async () => {
		const dispatcher = new TelegramUpdateDispatcher({ handle: () => new Promise<void>(() => undefined) }, new ProcessedUpdateIds());

		void dispatcher.dispatch(update(3));

		expect(await dispatcher.drain(20)).toBe(false);
	});
});
