import { readFileSync } from 'node:fs';

import { TelegramMessages } from './telegram-messages';
import { TelegramMessagesError } from './telegram-messages-error';

/**
 * Reads `messages.ru.json` next to this file (the API runs from sources through tsx, so the path is stable).
 * Throws at startup when the file is broken, rather than at the first message.
 */
export function loadTelegramMessages(fileUrl: URL = new URL('./messages.ru.json', import.meta.url)): TelegramMessages {
	let raw: unknown;

	try {
		raw = JSON.parse(readFileSync(fileUrl, 'utf8'));
	}
	catch {
		throw new TelegramMessagesError(['the texts file cannot be read or is not valid JSON']);
	}

	return TelegramMessages.fromJson(raw);
}
