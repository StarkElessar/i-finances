import { describe, expect, it } from 'vitest';

import {
	telegramLinkCompleteResultSchema,
	telegramLinkErrorCodes,
	telegramLinkErrorMessageByCode,
	telegramLinkStartResultSchema
} from '../src/telegram-link';

const CODE = 'abcdefghijklmnopqrstuvwxyz012-_9';

describe('telegram link contracts', () => {
	it('has a message for every error code, and the two conflicts read as on the «Безопасность» board', () => {
		for (const code of telegramLinkErrorCodes) {
			expect(telegramLinkErrorMessageByCode[code].length).toBeGreaterThan(0);
		}

		expect(telegramLinkErrorMessageByCode['telegram-linked-elsewhere']).toBe('Этот Telegram привязан к другому аккаунту.');
		expect(telegramLinkErrorMessageByCode['account-has-telegram']).toBe('К аккаунту уже привязан другой Telegram.');
	});

	it('parses the start answer with the bot links and refuses a malformed code', () => {
		const answer = {
			appUrl: `tg://resolve?domain=i_finances_bot&start=${CODE}`,
			botUrl: `https://t.me/i_finances_bot?start=${CODE}`,
			code: CODE,
			expiresAt: '2026-10-18T10:10:00.000Z',
			ok: true
		};

		expect(telegramLinkStartResultSchema.safeParse(answer).success).toBe(true);
		expect(telegramLinkStartResultSchema.safeParse({ ...answer, code: 'short' }).success).toBe(false);
	});

	it('tells pending from linked; pending carries nothing else, linked only the Telegram username', () => {
		expect(telegramLinkCompleteResultSchema.parse({ ok: true, status: 'pending', userId: 'leak' }))
			.toEqual({ ok: true, status: 'pending' });
		expect(telegramLinkCompleteResultSchema.parse({
			mergedUserId: 'leak',
			ok: true,
			status: 'linked',
			telegram: { telegramId: 'leak', username: 'anna_k' }
		})).toEqual({ ok: true, status: 'linked', telegram: { username: 'anna_k' } });
		expect(telegramLinkCompleteResultSchema.safeParse({ ok: true, status: 'linked' }).success).toBe(false);
		expect(telegramLinkCompleteResultSchema.safeParse({
			errorCode: 'telegram-linked-elsewhere',
			message: telegramLinkErrorMessageByCode['telegram-linked-elsewhere'],
			ok: false
		}).success).toBe(true);
		expect(telegramLinkCompleteResultSchema.safeParse({ errorCode: 'registration-closed', message: 'x', ok: false }).success)
			.toBe(false);
	});
});
