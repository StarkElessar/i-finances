import { normalizeUsername } from '@/modules/auth';

import { parseResetUserTelegramArguments } from './parse-reset-user-telegram-arguments';
import { ResetUserTelegramUsageError } from './reset-user-telegram-usage-error';
import type { TelegramResetPlan } from './telegram-reset-plan';
import { TelegramResetUserNotFoundError } from './telegram-reset-user-not-found-error';
import type { UserTelegramReset } from './user-telegram-reset';

/**
 * Terminal of the command: the script wires it to the process, tests to arrays.
 */
export type ResetUserTelegramTerminal = {
	/** Prints the question and returns the typed line, or `undefined` when the input ended. */
	ask: (question: string) => Promise<string | undefined>;
	print: (line: string) => void;
	printError: (line: string) => void;
};

export type RunResetUserTelegramInput = {
	/** The command line without `node` and the script path. */
	argv: readonly string[];
	reset: UserTelegramReset;
	terminal: ResetUserTelegramTerminal;
};

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

/**
 * The whole `reset-user-telegram` command (Р10): plan, print, and, with `--apply` and the typed username, change.
 * Returns the process exit code; never throws for operator mistakes.
 *
 * Dry run is the default: it reads and prints, and writes nothing. `--apply` asks for the username to be typed again,
 * so that a wrong username pasted from the shell history cannot be applied by a stray Enter.
 */
export async function runResetUserTelegram(input: RunResetUserTelegramInput): Promise<number> {
	const { reset, terminal } = input;
	let plan: TelegramResetPlan;
	let options: ReturnType<typeof parseResetUserTelegramArguments>;

	try {
		options = parseResetUserTelegramArguments(input.argv);
		plan = reset.plan(options.username);
	}
	catch (error: unknown) {
		if (error instanceof ResetUserTelegramUsageError) {
			terminal.printError(error.message);

			return EXIT_USAGE;
		}

		if (error instanceof TelegramResetUserNotFoundError) {
			terminal.printError(error.message);

			return EXIT_FAILED;
		}

		throw error;
	}

	for (const line of describePlan(plan)) {
		terminal.print(line);
	}

	const { telegram } = plan;

	if (telegram === undefined) {
		terminal.print('No Telegram is linked to this user. Nothing to do.');

		return EXIT_OK;
	}

	const locksOut = !plan.hasPassword && plan.passkeyCount === 0;

	terminal.print('');
	terminal.print('The command will:');
	terminal.print(`  - remove the Telegram link (${describeTelegram(telegram.telegramId, telegram.username)});`);
	terminal.print(`  - revoke ${plan.openLoginRequestCount} open Telegram login request(s);`);
	terminal.print(options.endSessions
		? `  - end all ${plan.sessionCount} session(s) of the user.`
		: '  - keep the sessions of the user (add --end-sessions to end them).');
	terminal.print('The user, the password, the passkeys, the household membership and all data stay.');

	if (locksOut) {
		terminal.print('');
		terminal.print('WARNING: this user has no password and no passkey. After the reset there is no way to sign in to this account.');

		if (!options.allowLockout) {
			terminal.print('Applying is refused without --allow-lockout.');
		}
	}

	if (!options.apply) {
		terminal.print('');
		terminal.print('Dry run: nothing was changed. Add --apply to do it.');

		return EXIT_OK;
	}

	if (locksOut && !options.allowLockout) {
		terminal.printError('Refused: the user would be left without any way to sign in. Nothing was changed.');

		return EXIT_FAILED;
	}

	const answer = await terminal.ask(`Type the username "${plan.username}" to confirm: `);

	if (answer === undefined || normalizeUsername(answer) !== plan.username) {
		terminal.printError('The username does not match. Nothing was changed.');

		return EXIT_FAILED;
	}

	const result = reset.apply({
		endSessions: options.endSessions,
		expectedTelegramId: telegram.telegramId,
		userId: plan.userId
	});

	if (!result.accountRemoved) {
		terminal.printError('The Telegram link of this user changed while the command was running. Nothing was changed; run it again.');

		return EXIT_FAILED;
	}

	terminal.print(
		`Done: the Telegram link is removed, ${result.requestsRevoked} login request(s) revoked, ${result.sessionsEnded} session(s) ended.`
	);

	return EXIT_OK;
}

function describeTelegram(telegramId: string, username: string | null): string {
	return username === null ? `id ${telegramId}` : `@${username}, id ${telegramId}`;
}

function describePlan(plan: TelegramResetPlan): string[] {
	const methods = [
		plan.hasPassword ? 'password' : undefined,
		plan.passkeyCount > 0 ? `${plan.passkeyCount} passkey(s)` : undefined
	].filter((method): method is string => method !== undefined);
	const lines = [
		`User: ${plan.username} (${plan.displayName}), ${plan.isActive ? 'active' : 'deactivated'}`,
		`Other ways to sign in: ${methods.length === 0 ? 'none' : methods.join(', ')}`
	];

	if (plan.telegram === undefined) {
		lines.push('Telegram: not linked');
	}
	else {
		lines.push(
			`Telegram: ${plan.telegram.firstName} (${describeTelegram(plan.telegram.telegramId, plan.telegram.username)}), `
			+ `linked ${plan.telegram.linkedAt.toISOString()}`
		);
	}

	return lines;
}
