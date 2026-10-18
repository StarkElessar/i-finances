import { createInterface, type Interface } from 'node:readline';

import { db, sqlite } from '@/infrastructure/database/client';
import { runResetUserTelegram, UserTelegramReset } from '@/modules/telegram-auth';

/**
 * Asks one question. Resolves with `undefined` when the input ends first (Ctrl+D, closed pipe, `</dev/null`): a pending
 * `readline.question` promise never settles then, and the process would exit with code 0 as if nothing had gone wrong.
 */
function ask(readline: Interface, question: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		const handleClose = () => {
			resolve(undefined);
		};

		readline.once('close', handleClose);
		readline.question(question, (answer) => {
			readline.off('close', handleClose);
			resolve(answer);
		});
	});
}

/**
 * Service recovery of access (Р10): removes the Telegram link of one user. Dry run unless `--apply`. The logic lives in
 * `runResetUserTelegram`; this file only wires the terminal to it.
 *
 *   tsx scripts/reset-user-telegram.ts <username> [--apply] [--end-sessions] [--allow-lockout]
 */
async function main(): Promise<number> {
	const readline = createInterface({ input: process.stdin, output: process.stdout });

	try {
		return await runResetUserTelegram({
			argv: process.argv.slice(2),
			reset: new UserTelegramReset(db),
			terminal: {
				ask: (question) => ask(readline, question),
				print: (line) => {
					console.warn(line);
				},
				printError: (line) => {
					console.error(line);
				}
			}
		});
	}
	finally {
		readline.close();
	}
}

main()
	.then((exitCode) => {
		process.exitCode = exitCode;
	})
	.catch((error: unknown) => {
		console.error('Failed to reset the Telegram link.', error);
		process.exitCode = 1;
	})
	.finally(() => {
		sqlite.close();
	});
