import { inspect } from 'node:util';

import { getTelegramConfig, TelegramConfigurationError } from '@/modules/telegram';

import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://finances.example.test';
const TOKEN = '123456:SECRET-bot-token-value';
const WEBHOOK_SECRET = 'w'.repeat(40);
const BASE_WEBHOOK_ENVIRONMENT = {
	TELEGRAM_BOT_TOKEN: TOKEN,
	TELEGRAM_BOT_USERNAME: 'i_finances_bot',
	TELEGRAM_UPDATES: 'webhook',
	TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET
};

describe('getTelegramConfig', () => {
	it('is switched off by default and needs no other variable', () => {
		const config = getTelegramConfig({}, ORIGIN);

		expect(config).toMatchObject({ updatesMode: 'off', botToken: undefined, webhookSecret: undefined, webhookUrl: undefined });
	});

	it('treats empty values from an .env file as not set', () => {
		const config = getTelegramConfig({ TELEGRAM_BOT_TOKEN: '', TELEGRAM_UPDATES: '', TELEGRAM_WEBHOOK_SECRET: '  ' }, ORIGIN);

		expect(config.updatesMode).toBe('off');
		expect(config.botToken).toBeUndefined();
	});

	it('keeps a token with mode off so the bot can still write', () => {
		const config = getTelegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN }, ORIGIN);

		expect(config.botToken?.reveal()).toBe(TOKEN);
		expect(config.updatesMode).toBe('off');
	});

	it('builds the webhook URL from AUTH_ORIGIN unless TELEGRAM_WEBHOOK_URL is given', () => {
		expect(getTelegramConfig(BASE_WEBHOOK_ENVIRONMENT, ORIGIN).webhookUrl).toBe('https://finances.example.test/api/telegram/webhook');
		expect(getTelegramConfig({ ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_WEBHOOK_URL: 'https://hooks.example.test/tg' }, ORIGIN).webhookUrl)
			.toBe('https://hooks.example.test/tg');
	});

	it('accepts polling with a token and a username, without a webhook secret', () => {
		const environment = { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: 'dev_bot', TELEGRAM_UPDATES: 'polling' };
		const config = getTelegramConfig(environment, ORIGIN);

		expect(config).toMatchObject({ updatesMode: 'polling', webhookSecret: undefined, webhookUrl: undefined });
	});

	describe.each([['production', { NODE_ENV: 'production' }], ['development', {}]])('in %s', (_name, extra) => {
		it.each(['webhook', 'polling'])('refuses mode %s without a bot token', (mode) => {
			const environment = { ...extra, ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_BOT_TOKEN: '', TELEGRAM_UPDATES: mode };

			expect(() => getTelegramConfig(environment, ORIGIN))
				.toThrow(/TELEGRAM_BOT_TOKEN is required/);
		});

		it('refuses a non-off mode without a bot username', () => {
			expect(() => getTelegramConfig({ ...extra, ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_BOT_USERNAME: undefined }, ORIGIN))
				.toThrow(/TELEGRAM_BOT_USERNAME is required/);
		});

		it('refuses webhook mode without a webhook secret', () => {
			expect(() => getTelegramConfig({ ...extra, ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_WEBHOOK_SECRET: undefined }, ORIGIN))
				.toThrow(/TELEGRAM_WEBHOOK_SECRET is required/);
		});
	});

	it('lists every problem at once', () => {
		expect(() => getTelegramConfig({ TELEGRAM_UPDATES: 'webhook' }, ORIGIN)).toThrow(
			/TELEGRAM_BOT_TOKEN is required.*TELEGRAM_BOT_USERNAME is required.*TELEGRAM_WEBHOOK_SECRET is required/
		);
	});

	it('allows mode off in production without anything else', () => {
		expect(getTelegramConfig({ NODE_ENV: 'production' }, ORIGIN).updatesMode).toBe('off');
	});

	it('rejects an unknown mode', () => {
		expect(() => getTelegramConfig({ TELEGRAM_UPDATES: 'longpoll' }, ORIGIN)).toThrow(TelegramConfigurationError);
	});

	it.each(['with space', 'ünicode', 'a/b', 'x'.repeat(257)])('rejects the webhook secret %j', (secret) => {
		expect(() => getTelegramConfig({ ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_WEBHOOK_SECRET: secret }, ORIGIN))
			.toThrow(/TELEGRAM_WEBHOOK_SECRET must be 1-256/);
	});

	it('requires a long webhook secret and an https URL in production only', () => {
		const shortSecret = { ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_WEBHOOK_SECRET: 'short' };

		expect(() => getTelegramConfig({ ...shortSecret, NODE_ENV: 'production' }, ORIGIN)).toThrow(/at least 32 characters/);
		expect(getTelegramConfig(shortSecret, ORIGIN).webhookSecret?.reveal()).toBe('short');
		expect(() => getTelegramConfig({ ...BASE_WEBHOOK_ENVIRONMENT, NODE_ENV: 'production' }, 'http://finances.example.test'))
			.toThrow(/must use https in production/);
		expect(getTelegramConfig(BASE_WEBHOOK_ENVIRONMENT, 'http://localhost:5173').webhookUrl)
			.toBe('http://localhost:5173/api/telegram/webhook');
	});

	it.each(['@i_finances_bot', 'a b', 'ab'])('rejects the bot username %j', (username) => {
		expect(() => getTelegramConfig({ ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_BOT_USERNAME: username }, ORIGIN))
			.toThrow(/TELEGRAM_BOT_USERNAME must be/);
	});

	describe('secrets never leak', () => {
		it('through the error of a misconfiguration', () => {
			const attempts = [
				{ ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_WEBHOOK_SECRET: 'bad secret with spaces', TELEGRAM_BOT_USERNAME: '@x' },
				{ ...BASE_WEBHOOK_ENVIRONMENT, TELEGRAM_UPDATES: 'bogus' },
				{ ...BASE_WEBHOOK_ENVIRONMENT, NODE_ENV: 'production', TELEGRAM_WEBHOOK_SECRET: 'short-secret' }
			];

			for (const environment of attempts) {
				let message = '';

				try {
					getTelegramConfig(environment, 'http://insecure.example.test');
				}
				catch (error) {
					message = String(error);
				}

				expect(message).not.toBe('');
				expect(message).not.toContain(TOKEN);
				expect(message).not.toContain(environment.TELEGRAM_WEBHOOK_SECRET);
			}
		});

		it('through JSON, string conversion and console formatting of the config', () => {
			const config = getTelegramConfig(BASE_WEBHOOK_ENVIRONMENT, ORIGIN);
			const renderings = [
				JSON.stringify(config),
				String(config.botToken),
				`${config.webhookSecret}`,
				inspect(config, { depth: 5 }),
				inspect(config.botToken)
			];

			for (const rendering of renderings) {
				expect(rendering).not.toContain(TOKEN);
				expect(rendering).not.toContain(WEBHOOK_SECRET);
			}

			expect(JSON.stringify(config)).toContain('[redacted]');
		});
	});
});
