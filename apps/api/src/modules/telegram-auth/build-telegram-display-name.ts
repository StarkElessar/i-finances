import type { TelegramIdentity } from './telegram-identity';

/** The same limit as `updateDisplayNameInputSchema`, so the name can be confirmed or edited as it is. */
const MAX_DISPLAY_NAME_LENGTH = 100;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;
const WHITESPACE_RUNS = /\s+/gu;

function clean(value: string | null): string {
	return (value ?? '').replace(CONTROL_CHARACTERS, ' ').replace(WHITESPACE_RUNS, ' ').trim();
}

/**
 * The display name of a user created by a Telegram sign-up: first and last name from Telegram, without control and
 * formatting characters (direction overrides included). Onboarding asks the person to confirm it (Р4, the «фикус»
 * lesson), so this is only a starting value.
 */
export function buildTelegramDisplayName(identity: TelegramIdentity): string {
	const fullName = [clean(identity.firstName), clean(identity.lastName)].filter((part) => part !== '').join(' ');

	if (fullName !== '') {
		return fullName.slice(0, MAX_DISPLAY_NAME_LENGTH);
	}

	return identity.username === null ? `Telegram ${identity.telegramId}` : identity.username;
}
