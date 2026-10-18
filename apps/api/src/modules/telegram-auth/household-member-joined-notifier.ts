import type { HouseholdMemberJoinedNotice } from '@/modules/household';
import { type TelegramBotClient, TelegramForbiddenError, type TelegramMessages } from '@/modules/telegram';

import { HOUSEHOLD_NAME_MAX_LENGTH } from '@i-finances/contracts';

import type { TelegramAccountRepository } from './telegram-account-repository';
import { toSingleLine } from './to-single-line';

/** The same limit as `updateDisplayNameInputSchema`: a member's display name. */
const MAX_MEMBER_NAME_LENGTH = 100;

export type HouseholdMemberJoinedNotifierDependencies = {
	accounts: Pick<TelegramAccountRepository, 'findByUserId' | 'markBotBlocked'>;
	/** Undefined while no bot token is configured: then nothing is sent. */
	botClient: TelegramBotClient | undefined;
	messages: TelegramMessages;
	now?: () => Date;
};

/**
 * Tells the owner of the household, through the bot, that an invitation was accepted (Р5, A9): «Анна теперь в окружении
 * «Семья». Если вы не приглашали этого человека, удалите его в разделе «Окружение».»
 *
 * Runs after the acceptance is committed and never rejects: a failed send changes nothing about the acceptance. An owner
 * without a linked Telegram gets nothing. A 403 (the bot is blocked) is recorded as `bot_blocked_at`; any other failure
 * is logged with its error class only, never the token or the text of the message.
 */
export class HouseholdMemberJoinedNotifier {
	private readonly now: () => Date;

	public constructor(private readonly dependencies: HouseholdMemberJoinedNotifierDependencies) {
		this.now = dependencies.now ?? (() => new Date());
	}

	public async notifyMemberJoined(notice: HouseholdMemberJoinedNotice): Promise<void> {
		const { accounts, botClient, messages } = this.dependencies;

		if (botClient === undefined) {
			return;
		}

		try {
			const owner = await accounts.findByUserId(notice.inviterUserId);

			if (owner === undefined) {
				return;
			}

			await botClient.sendMessage({
				chatId: owner.chatId,
				text: messages.text('household.memberJoined', {
					household: toSingleLine(notice.householdName, HOUSEHOLD_NAME_MAX_LENGTH),
					name: toSingleLine(notice.memberDisplayName, MAX_MEMBER_NAME_LENGTH)
				})
			});
		}
		catch (error: unknown) {
			if (error instanceof TelegramForbiddenError) {
				console.warn('Telegram bot is blocked by the household owner; bot_blocked_at is recorded.');
				await this.recordBlocked(notice.inviterUserId);

				return;
			}

			console.error('Telegram notification about a joined household member was not sent.', errorClassOf(error));
		}
	}

	private async recordBlocked(userId: string): Promise<void> {
		try {
			await this.dependencies.accounts.markBotBlocked(userId, this.now());
		}
		catch (error: unknown) {
			console.error('Recording bot_blocked_at failed.', errorClassOf(error));
		}
	}
}

function errorClassOf(error: unknown): string {
	return error instanceof Error ? error.name : 'UnknownError';
}
