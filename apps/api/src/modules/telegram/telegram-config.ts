import { z } from 'zod';

import { TelegramConfigurationError } from './telegram-configuration-error';
import { TelegramSecret } from './telegram-secret';
import { TELEGRAM_UPDATES_MODES, type TelegramUpdatesMode } from './telegram-updates-mode';

/** Telegram accepts 1-256 characters of `A-Z a-z 0-9 _ -` as the webhook secret token. */
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const PRODUCTION_WEBHOOK_SECRET_MIN_LENGTH = 32;
const BOT_USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
/**
 * BotFather issues `<bot id>:<letters, digits, _ and ->`. The token becomes a path segment of every Bot API URL, so
 * anything else (`/`, `?`, `#`, spaces, a pasted quote) is refused instead of silently changing the request path.
 */
const BOT_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;
const WEBHOOK_PATH = '/api/telegram/webhook';

/** An empty value in `.env` ("TELEGRAM_BOT_TOKEN=") means "not set". */
const optionalText = z.string().trim().transform((value) => (value === '' ? undefined : value)).optional();

const telegramEnvironmentSchema = z.object({
	TELEGRAM_BOT_TOKEN: optionalText,
	TELEGRAM_BOT_USERNAME: optionalText,
	TELEGRAM_UPDATES: optionalText.pipe(z.enum(TELEGRAM_UPDATES_MODES).default('off')),
	TELEGRAM_WEBHOOK_SECRET: optionalText,
	TELEGRAM_WEBHOOK_URL: optionalText
});

export type TelegramConfig = {
	/** Empty token: Telegram is switched off, there is no bot to talk to. */
	botToken: TelegramSecret | undefined;
	/** Bot name without `@`, for `https://t.me/<name>` links. */
	botUsername: string | undefined;
	updatesMode: TelegramUpdatesMode;
	/** Set only in `webhook` mode. */
	webhookSecret: TelegramSecret | undefined;
	/** Set only in `webhook` mode. */
	webhookUrl: string | undefined;
};

function describeIssues(error: z.ZodError): string[] {
	// Only the path and the message are taken on purpose: an issue must never carry the offending value into the error.
	return error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`);
}

function resolveWebhookUrl(explicitUrl: string | undefined, authOrigin: string): string {
	return explicitUrl ?? new URL(WEBHOOK_PATH, authOrigin).toString();
}

/**
 * Reads the Telegram environment (decision Р12 in `development/decisions/telegram-auth-and-households-v1.md`).
 *
 * - `TELEGRAM_UPDATES` is `off` by default; tests and anyone who has not configured a bot stay on it.
 * - Any other mode needs a bot token and a bot username; `webhook` also needs `TELEGRAM_WEBHOOK_SECRET`.
 * - In production the webhook URL must be https (Telegram refuses plain http) and the secret at least 32 characters.
 *
 * Throws `TelegramConfigurationError` listing every problem (variable names only, never values), so the API refuses to
 * start instead of running with a half-configured bot.
 */
export function getTelegramConfig(environment: NodeJS.ProcessEnv, authOrigin: string): TelegramConfig {
	const parsed = telegramEnvironmentSchema.safeParse(environment);

	if (!parsed.success) {
		throw new TelegramConfigurationError(describeIssues(parsed.error));
	}

	const {
		TELEGRAM_BOT_TOKEN: botToken,
		TELEGRAM_BOT_USERNAME: botUsername,
		TELEGRAM_UPDATES: updatesMode,
		TELEGRAM_WEBHOOK_SECRET: webhookSecret,
		TELEGRAM_WEBHOOK_URL: explicitWebhookUrl
	} = parsed.data;
	const isProduction = environment.NODE_ENV === 'production';
	const problems: string[] = [];

	if (botToken !== undefined && !BOT_TOKEN_PATTERN.test(botToken)) {
		problems.push('TELEGRAM_BOT_TOKEN must look like <digits>:<letters, digits, "_" and "-">, as issued by BotFather');
	}

	if (botUsername !== undefined && !BOT_USERNAME_PATTERN.test(botUsername)) {
		problems.push('TELEGRAM_BOT_USERNAME must be the bot name without "@" (letters, digits, underscore)');
	}

	if (updatesMode !== 'off') {
		if (botToken === undefined) {
			problems.push(`TELEGRAM_BOT_TOKEN is required when TELEGRAM_UPDATES=${updatesMode}`);
		}

		if (botUsername === undefined) {
			problems.push(`TELEGRAM_BOT_USERNAME is required when TELEGRAM_UPDATES=${updatesMode}`);
		}
	}

	if (updatesMode === 'webhook') {
		if (webhookSecret === undefined) {
			problems.push('TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_UPDATES=webhook');
		}
		else if (!WEBHOOK_SECRET_PATTERN.test(webhookSecret)) {
			problems.push('TELEGRAM_WEBHOOK_SECRET must be 1-256 characters of A-Z, a-z, 0-9, "_" and "-"');
		}
		else if (isProduction && webhookSecret.length < PRODUCTION_WEBHOOK_SECRET_MIN_LENGTH) {
			problems.push(`TELEGRAM_WEBHOOK_SECRET must be at least ${PRODUCTION_WEBHOOK_SECRET_MIN_LENGTH} characters in production`);
		}

		const webhookUrl = resolveWebhookUrl(explicitWebhookUrl, authOrigin);

		if (!URL.canParse(webhookUrl)) {
			problems.push('TELEGRAM_WEBHOOK_URL must be an absolute URL');
		}
		else if (isProduction && new URL(webhookUrl).protocol !== 'https:') {
			problems.push('TELEGRAM_WEBHOOK_URL must use https in production (set AUTH_ORIGIN to the public https origin)');
		}
	}

	if (problems.length > 0) {
		throw new TelegramConfigurationError(problems);
	}

	return {
		botToken: botToken === undefined ? undefined : new TelegramSecret(botToken),
		botUsername,
		updatesMode,
		webhookSecret: updatesMode === 'webhook' && webhookSecret !== undefined ? new TelegramSecret(webhookSecret) : undefined,
		webhookUrl: updatesMode === 'webhook' ? resolveWebhookUrl(explicitWebhookUrl, authOrigin) : undefined
	};
}
