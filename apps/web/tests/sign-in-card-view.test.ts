import { formatMinutesAccusative, formatMinutesGenitive } from '@/features/auth/model/format-minutes';
import { describeSignInCard } from '@/features/auth/model/sign-in-card-view';
import type { TelegramSignInLink } from '@/features/auth/model/telegram-sign-in-state';

import { describe, expect, it } from 'vitest';

const LINK: TelegramSignInLink = {
	appUrl: 'tg://resolve?domain=bot&start=code',
	botUrl: 'https://t.me/bot?start=code',
	code: 'C'.repeat(32),
	expiresAtMs: 0,
	ttlMinutes: 10
};

describe('describeSignInCard (Auth-Telegram board)', () => {
	it('1. ready: Telegram first, then the passkey and the password', () => {
		expect(describeSignInCard({ kind: 'ready', link: LINK })).toEqual({
			banners: [],
			description: 'Подтвердите вход в Telegram одним нажатием. Пароль не нужен.',
			divider: 'after-telegram',
			hasRegistrationHint: true,
			isCancellable: false,
			passkey: 'secondary',
			password: 'ghost',
			telegram: { kind: 'link', label: 'Войти через Telegram' },
			title: 'Добро пожаловать'
		});
	});

	it('2. the link is still loading: a disabled button with a spinner', () => {
		for (const kind of ['idle', 'preparing'] as const) {
			expect(describeSignInCard({ kind })).toMatchObject({
				description: 'Готовим вход через Telegram.',
				passkey: 'secondary',
				telegram: { kind: 'loading' }
			});
		}
	});

	it('3. waiting for the bot: open again or cancel, nothing else', () => {
		expect(describeSignInCard({ connectionLost: false, kind: 'waiting', link: LINK })).toEqual({
			banners: [{ icon: 'send', text: 'Откройте бота и нажмите «Войти». Заявка действует 10 минут.', tone: 'info' }],
			divider: 'none',
			hasRegistrationHint: false,
			isCancellable: true,
			passkey: 'none',
			password: 'none',
			telegram: { kind: 'link', label: 'Открыть Telegram ещё раз' },
			title: 'Ждём подтверждения в Telegram'
		});
	});

	it('3a. waiting without a connection adds a warning', () => {
		const view = describeSignInCard({ connectionLost: true, kind: 'waiting', link: LINK });

		expect(view.banners).toHaveLength(2);
		expect(view.banners[1]).toMatchObject({ title: 'Нет связи с сервером.', tone: 'warning' });
	});

	it.each([
		['expired', 'Ссылка устарела.', 'warning', 'Попробовать снова'],
		['browser-mismatch', 'Вход начат в другом браузере.', 'danger', 'Начать заново'],
		['rejected', 'Вы отклонили вход в Telegram.', 'warning', 'Попробовать снова']
	] as const)('4–6. %s: only a restart', (reason, title, tone, label) => {
		const view = describeSignInCard({ kind: 'failed', message: '', reason, ttlMinutes: 10 });

		expect(view.banners).toEqual([expect.objectContaining({ title, tone })]);
		expect(view.telegram).toEqual({ kind: 'restart', label });
		expect(view.passkey).toBe('none');
		expect(view.password).toBe('none');
	});

	it('4. the expired text names the lifetime of the request', () => {
		const view = describeSignInCard({ kind: 'failed', message: '', reason: 'expired', ttlMinutes: 1 });

		expect(view.banners[0]?.text).toBe('Прошло больше 1 минуты. Начните вход заново.');
	});

	it('7. registration closed: no Telegram, the passkey and the password', () => {
		const view = describeSignInCard({ kind: 'failed', message: '', reason: 'registration-closed' });

		expect(view.banners[0]).toMatchObject({ title: 'Аккаунт не найден.', tone: 'danger' });
		expect(view.telegram).toEqual({ kind: 'none' });
		expect(view.divider).toBe('none');
		expect(view.passkey).toBe('secondary');
		expect(view.password).toBe('ghost');
	});

	it('8. too many attempts: Telegram disabled, minutes from Retry-After', () => {
		const view = describeSignInCard({ kind: 'failed', message: '', reason: 'rate-limited', retryAfterSeconds: 241 });

		expect(view.banners[0]).toMatchObject({ text: 'Повторите через 5 минут.', title: 'Слишком много попыток.' });
		expect(view.telegram).toEqual({ kind: 'disabled' });
		expect(view.passkey).toBe('secondary');
	});

	it('9. Telegram off on the server: no Telegram button at all', () => {
		expect(describeSignInCard({ kind: 'unavailable' })).toMatchObject({
			description: 'Используйте ключ доступа, сохранённый на этом или другом устройстве.',
			divider: 'after-passkey',
			hasRegistrationHint: false,
			passkey: 'secondary',
			password: 'secondary',
			telegram: { kind: 'none' }
		});
	});

	it('a network failure of start offers a retry and the other ways', () => {
		const view = describeSignInCard({ kind: 'failed', message: '', reason: 'network' });

		expect(view.telegram).toEqual({ kind: 'restart', label: 'Попробовать снова' });
		expect(view.passkey).toBe('secondary');
	});
});

describe('minutes in Russian', () => {
	it.each([
		[1, '1 минуту', '1 минуты'],
		[2, '2 минуты', '2 минут'],
		[5, '5 минут', '5 минут'],
		[10, '10 минут', '10 минут'],
		[21, '21 минуту', '21 минуты'],
		[22, '22 минуты', '22 минут']
	])('%i', (minutes, accusative, genitive) => {
		expect(formatMinutesAccusative(minutes)).toBe(accusative);
		expect(formatMinutesGenitive(minutes)).toBe(genitive);
	});
});
