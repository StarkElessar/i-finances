import { inspect } from 'node:util';

const REDACTED = '[redacted]';

/**
 * Holds a bot token or a webhook secret so that it cannot reach a log line or a response by accident:
 * `String()`, template strings, `JSON.stringify` and `util.inspect` (so `console.log` too) all print `[redacted]`.
 * The only way to read the value is the explicit `reveal()`, which only the Bot API client and the webhook check call.
 */
export class TelegramSecret {
	readonly #value: string;

	public constructor(value: string) {
		this.#value = value;
	}

	public reveal(): string {
		return this.#value;
	}

	public toString(): string {
		return REDACTED;
	}

	public toJSON(): string {
		return REDACTED;
	}

	public [inspect.custom](): string {
		return REDACTED;
	}
}
