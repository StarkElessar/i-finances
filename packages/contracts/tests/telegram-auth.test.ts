import { describe, expect, it } from 'vitest';

import { currentSessionResponseSchema } from '../src/auth';
import {
	devTelegramConfirmInputSchema,
	telegramSignInCodeInputSchema,
	telegramSignInCompleteResultSchema,
	telegramSignInErrorCodes,
	telegramSignInErrorMessageByCode,
	telegramSignInStartResultSchema
} from '../src/telegram-auth';

const CODE = 'abcdefghijklmnopqrstuvwxyz012-_9';

describe('telegram sign-in contracts', () => {
	it('accepts only a 32-character base64url code', () => {
		expect(telegramSignInCodeInputSchema.safeParse({ code: CODE }).success).toBe(true);

		for (const code of ['', 'short', `${CODE}x`, `${CODE.slice(0, 31)}/`, `${CODE.slice(0, 31)} `]) {
			expect(telegramSignInCodeInputSchema.safeParse({ code }).success, code).toBe(false);
		}
	});

	it('has a message for every error code', () => {
		for (const code of telegramSignInErrorCodes) {
			expect(telegramSignInErrorMessageByCode[code].length).toBeGreaterThan(0);
		}
	});

	it('parses the start answer with the bot links', () => {
		expect(telegramSignInStartResultSchema.safeParse({
			appUrl: `tg://resolve?domain=i_finances_bot&start=${CODE}`,
			botUrl: `https://t.me/i_finances_bot?start=${CODE}`,
			code: CODE,
			expiresAt: '2026-10-18T10:10:00.000Z',
			ok: true
		}).success).toBe(true);
	});

	it('tells pending from confirmed, and pending carries nothing else', () => {
		expect(telegramSignInCompleteResultSchema.parse({ ok: true, status: 'pending', userId: 'leak' }))
			.toEqual({ ok: true, status: 'pending' });
		expect(telegramSignInCompleteResultSchema.parse({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' }))
			.toEqual({ hasHousehold: false, isNewUser: true, ok: true, status: 'confirmed' });
		expect(telegramSignInCompleteResultSchema.safeParse({ ok: true, status: 'confirmed' }).success).toBe(false);
		expect(telegramSignInCompleteResultSchema.safeParse({
			errorCode: 'browser-mismatch',
			message: telegramSignInErrorMessageByCode['browser-mismatch'],
			ok: false
		}).success).toBe(true);
	});

	it('validates the dev confirmation identity', () => {
		expect(devTelegramConfirmInputSchema.safeParse({ code: CODE, firstName: 'Анна', telegramId: '1001' }).success).toBe(true);
		expect(devTelegramConfirmInputSchema.safeParse({ code: CODE, firstName: 'Анна', telegramId: '-5' }).success).toBe(false);
		expect(devTelegramConfirmInputSchema.safeParse({ code: CODE, firstName: ' ', telegramId: '1001' }).success).toBe(false);
		expect(devTelegramConfirmInputSchema.safeParse({ code: CODE, firstName: 'A', telegramId: '1', username: '@a' }).success)
			.toBe(false);
	});

	it('requires hasPassword and telegram in an authenticated session', () => {
		const base = { authenticated: true, household: null, user: { displayName: 'Анна', id: 'u', username: 'tg-1' } };

		expect(currentSessionResponseSchema.safeParse({ ...base, hasPassword: false, telegram: { username: null } }).success).toBe(true);
		expect(currentSessionResponseSchema.safeParse({ ...base, telegram: null }).success).toBe(false);
		expect(currentSessionResponseSchema.safeParse({ ...base, hasPassword: true }).success).toBe(false);
	});
});
