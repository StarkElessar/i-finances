import {
	loadTelegramMessages,
	TELEGRAM_MESSAGE_KEYS,
	TELEGRAM_MESSAGE_PLACEHOLDERS,
	TelegramMessages,
	TelegramMessagesError
} from '@/modules/telegram';

import { describe, expect, it } from 'vitest';

function templatesWith(overrides: Record<string, string | undefined>): Record<string, string> {
	const templates = new Map<string, string>();

	for (const key of TELEGRAM_MESSAGE_KEYS) {
		templates.set(key, TELEGRAM_MESSAGE_PLACEHOLDERS[key].map((name: string) => `{${name}}`).join(' ') || 'text');
	}

	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) {
			templates.delete(key);
		}
		else {
			templates.set(key, value);
		}
	}

	return Object.fromEntries(templates);
}

describe('bot texts', () => {
	const messages = loadTelegramMessages();

	it('the shipped messages.ru.json holds every registered key', () => {
		for (const key of TELEGRAM_MESSAGE_KEYS) {
			const placeholders = TELEGRAM_MESSAGE_PLACEHOLDERS[key];
			const values = Object.fromEntries(placeholders.map((name: string) => [name, `<${name}>`]));
			const text = (messages.text as (key: string, values?: object) => string)(key, placeholders.length > 0 ? values : undefined);

			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toMatch(/\{[A-Za-z]/);
		}
	});

	it('fills placeholders', () => {
		expect(messages.text('signIn.confirmation', { device: 'Safari, iOS', site: 'finances.example.by', when: '18 октября, 21:04' }))
			.toBe('Вход в i-finances: Safari, iOS, 18 октября, 21:04.\n'
				+ 'Нажимайте «Войти», только если вы сами только что начали вход на finances.example.by. '
				+ 'Если ссылку на бота вам кто-то прислал, нажмите «Это не я».');
		expect(messages.text('household.memberJoined', { household: 'Семья', name: 'Анна' })).toContain('«Семья»');
		expect(messages.text('signIn.confirmButton')).toBe('Войти');
		expect(messages.text('signIn.rejectButton')).toBe('Это не я');
	});

	it('names the site in every text that asks to confirm or tells where to go (review of Р11)', () => {
		const site = 'finances.example.by';
		const device = 'Safari, iOS';
		const when = '18 октября, 21:04';

		expect(messages.text('signIn.confirmation', { device, site, when }))
			.toContain(`только если вы сами только что начали вход на ${site}`);
		expect(messages.text('link.confirmation', { account: 'Сергей', device, login: 'sergei', site, when }))
			.toContain(`только если вы сами только что начали привязку на ${site}`);
		expect(messages.text('start.greeting', { site })).toContain(`откройте ${site}`);
	});

	it('names the unique login next to the display name in the link texts', () => {
		const values = {
			account: 'Сергей',
			device: 'Safari, iOS',
			login: 'sergei',
			site: 'finances.example.by',
			when: '18 октября, 21:04'
		};

		expect(messages.text('link.confirmation', values))
			.toMatch(/^Привязать этот Telegram к аккаунту i-finances «Сергей» \(логин sergei\)\?\n/u);
		expect(messages.text('link.accountHasTelegram', { account: 'Сергей', login: 'sergei' })).toContain('«Сергей» (логин sergei)');
	});

	it('never tells anybody to change a password: Telegram users have none', () => {
		for (const key of TELEGRAM_MESSAGE_KEYS) {
			const values = Object.fromEntries(TELEGRAM_MESSAGE_PLACEHOLDERS[key].map((name: string) => [name, 'x']));
			const text = (messages.text as (key: string, values?: object) => string)(key, values);

			expect(text).not.toMatch(/смените пароль|сменить пароль|смену пароля/iu);
		}

		expect(messages.text('signIn.rejected'))
			.toContain('завершите незнакомые сеансы в разделе «Безопасность» и сообщите владельцу окружения');
	});

	it('speaks of a joined member without grammatical gender', () => {
		expect(messages.text('household.memberJoined', { household: 'Семья', name: 'Анна' }))
			.toBe('Анна теперь в окружении «Семья». Если вы не приглашали этого человека, удалите его в разделе «Окружение».');
	});

	it('inserts values literally: no re-expansion, no replacement patterns', () => {
		const text = messages.text('household.memberJoined', { household: 'Семья', name: '{household} $& $1 ${household}' });

		expect(text).toContain('{household} $& $1 ${household}');
		expect(text).toContain('«Семья»');
	});

	it('does not evaluate anything in a value', () => {
		const marker = { evaluated: false };

		(globalThis as { telegramMessagesProbe?: typeof marker }).telegramMessagesProbe = marker;

		messages.text('household.memberJoined', { household: 'h', name: '${(globalThis.telegramMessagesProbe.evaluated = true)}' });
		delete (globalThis as { telegramMessagesProbe?: typeof marker }).telegramMessagesProbe;

		expect(marker.evaluated).toBe(false);
	});
});

describe('TelegramMessages.fromJson', () => {
	it('accepts the exact registered set', () => {
		expect(() => TelegramMessages.fromJson(templatesWith({}))).not.toThrow();
	});

	it.each([
		['a missing key', templatesWith({ 'signIn.confirmed': undefined }), /missing text for "signIn.confirmed"/],
		['an empty text', templatesWith({ 'signIn.confirmed': '  ' }), /missing text for "signIn.confirmed"/],
		['an unknown key', templatesWith({ 'signIn.surprise': 'x' }), /unknown key "signIn.surprise"/],
		['an unknown placeholder', templatesWith({ 'signIn.confirmed': 'hi {who}' }), /unknown placeholder \{who\}/],
		['a missing placeholder', templatesWith({ 'signIn.confirmation': 'only {device}' }), /lacks placeholder \{when\}/]
	])('refuses %s', (_name, templates, expected) => {
		expect(() => TelegramMessages.fromJson(templates)).toThrow(expected);
		expect(() => TelegramMessages.fromJson(templates)).toThrow(TelegramMessagesError);
	});

	it.each([[null], [[]], ['text'], [{ 'start.greeting': 5 }]])('refuses %j as a file', (raw) => {
		expect(() => TelegramMessages.fromJson(raw)).toThrow(TelegramMessagesError);
	});
});
