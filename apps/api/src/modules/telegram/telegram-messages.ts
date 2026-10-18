import { z } from 'zod';

import {
	TELEGRAM_MESSAGE_KEYS,
	TELEGRAM_MESSAGE_PLACEHOLDERS,
	type TelegramMessageKey,
	type TelegramMessageParameters
} from './telegram-message-key';
import { TelegramMessagesError } from './telegram-messages-error';

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const templatesSchema = z.record(z.string(), z.string());

function findPlaceholders(template: string): Set<string> {
	return new Set([...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => String(match[1])));
}

/**
 * The bot's texts. Templates are plain strings with `{name}` placeholders, filled by a single pass of string
 * replacement: no code runs, and a substituted value is never scanned for placeholders again (a user named
 * `{household}` stays literal). Values are inserted as plain text; the client sends messages without `parse_mode`.
 */
export class TelegramMessages {
	readonly #templates: ReadonlyMap<TelegramMessageKey, string>;

	private constructor(templates: ReadonlyMap<TelegramMessageKey, string>) {
		this.#templates = templates;
	}

	/** Checks that the JSON holds exactly the registered keys with exactly the registered placeholders. */
	public static fromJson(raw: unknown): TelegramMessages {
		const parsed = templatesSchema.safeParse(raw);

		if (!parsed.success) {
			throw new TelegramMessagesError(['the file must be a flat JSON object of strings']);
		}

		const problems: string[] = [];
		const templates = new Map<TelegramMessageKey, string>();

		for (const key of Object.keys(parsed.data)) {
			if (!Object.hasOwn(TELEGRAM_MESSAGE_PLACEHOLDERS, key)) {
				problems.push(`unknown key "${key}"`);
			}
		}

		for (const key of TELEGRAM_MESSAGE_KEYS) {
			const template = Object.hasOwn(parsed.data, key) ? parsed.data[key] : undefined;

			if (template === undefined || template.trim() === '') {
				problems.push(`missing text for "${key}"`);
				continue;
			}

			const found = findPlaceholders(template);
			const expected = new Set<string>(TELEGRAM_MESSAGE_PLACEHOLDERS[key]);

			for (const name of found) {
				if (!expected.has(name)) {
					problems.push(`"${key}" uses unknown placeholder {${name}}`);
				}
			}

			for (const name of expected) {
				if (!found.has(name)) {
					problems.push(`"${key}" lacks placeholder {${name}}`);
				}
			}

			templates.set(key, template);
		}

		if (problems.length > 0) {
			throw new TelegramMessagesError(problems);
		}

		return new TelegramMessages(templates);
	}

	public text<K extends TelegramMessageKey>(key: K, ...parameters: TelegramMessageParameters<K>): string {
		const template = this.#templates.get(key);

		if (template === undefined) {
			throw new TelegramMessagesError([`missing text for "${key}"`]);
		}

		const values: Record<string, string> = parameters[0] ?? {};

		// A function replacer: a string replacement would give `$&` and `$1` in a user's name a meaning.
		return template.replace(PLACEHOLDER_PATTERN, (_placeholder, name: string) => values[name] ?? '');
	}
}
