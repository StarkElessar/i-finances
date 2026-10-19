import { normalizeUsername } from '@/modules/auth';

import { ResetUserTelegramUsageError } from './reset-user-telegram-usage-error';

export const RESET_USER_TELEGRAM_USAGE = 'Usage: telegram:reset <username> [--apply] [--end-sessions] [--allow-lockout]';

export type ResetUserTelegramArguments = {
	/** Refuse-by-default override: reset a user who has neither a password nor a passkey (they cannot sign in after it). */
	allowLockout: boolean;
	/** Without it the command only prints what it would do. */
	apply: boolean;
	endSessions: boolean;
	/** Normalized, as stored in `users.username`. */
	username: string;
};

/**
 * Reads the command line. Anything unexpected is an error, never ignored: a misspelled `--apply` must not silently turn
 * a real run into a dry run, and a misspelled `--end-sessions` must not skip a step the operator asked for.
 * A bare `--` (inserted by some package runners) is skipped.
 */
export function parseResetUserTelegramArguments(argv: readonly string[]): ResetUserTelegramArguments {
	const positional: string[] = [];
	const flags = new Set<string>();

	for (const argument of argv) {
		if (argument === '--') {
			continue;
		}

		if (argument.startsWith('--')) {
			if (!['--allow-lockout', '--apply', '--end-sessions'].includes(argument)) {
				throw new ResetUserTelegramUsageError(`Unknown option ${argument}. ${RESET_USER_TELEGRAM_USAGE}`);
			}

			flags.add(argument);
		}
		else {
			positional.push(argument);
		}
	}

	const [rawUsername, ...extra] = positional;

	if (positional.length === 0 || normalizeUsername(rawUsername) === '') {
		throw new ResetUserTelegramUsageError(`The username is required. ${RESET_USER_TELEGRAM_USAGE}`);
	}

	if (extra.length > 0) {
		throw new ResetUserTelegramUsageError(`Exactly one username is expected. ${RESET_USER_TELEGRAM_USAGE}`);
	}

	return {
		allowLockout: flags.has('--allow-lockout'),
		apply: flags.has('--apply'),
		endSessions: flags.has('--end-sessions'),
		username: normalizeUsername(rawUsername)
	};
}
