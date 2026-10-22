import { ApiHttpError } from '@/shared/api';

import type { TelegramRequestFailure, TelegramRequestFailureKind, TelegramRequestProtocol } from '@/features/telegram-request';

import {
	type CurrentSessionResponse,
	type TelegramLinkCompleteResult,
	telegramLinkErrorMessageByCode,
	telegramLinkFailureSchema,
	type TelegramLinkStartResult,
	type TelegramSignInCancelResult
} from '@i-finances/contracts';

import type { TelegramLinkConfirmed, TelegramLinkFailureReason } from './telegram-link-state';

export type TelegramLinkGateway = {
	cancelTelegramLink(code: string): Promise<TelegramSignInCancelResult>;
	completeTelegramLink(code: string): Promise<TelegramLinkCompleteResult>;
	/** Read only when a confirmation may have been lost on the way (see `recoverConfirmation` of the protocol). */
	currentSession(): Promise<CurrentSessionResponse>;
	startTelegramLink(): Promise<TelegramLinkStartResult>;
};

const FAILURE_REASON_BY_ERROR_CODE: Partial<Record<string, TelegramLinkFailureReason>> = {
	'account-has-telegram': 'account-has-telegram',
	'browser-mismatch': 'browser-mismatch',
	'link-expired': 'expired',
	'link-rejected': 'rejected',
	'rate-limited': 'rate-limited',
	'telegram-linked-elsewhere': 'linked-elsewhere'
};

const FAILURE_KIND_BY_ERROR_CODE: Partial<Record<string, TelegramRequestFailureKind>> = {
	'account-has-telegram': 'already-confirmed',
	'browser-mismatch': 'browser-mismatch',
	'link-expired': 'expired',
	'rate-limited': 'rate-limited',
	'telegram-unavailable': 'unavailable',
	unexpected: 'transient'
};

/** A contract failure body, or `null` for anything else: no network, a proxy page, a body the contract does not know. */
function readLinkFailure(error: unknown): TelegramRequestFailure | null {
	if (!(error instanceof ApiHttpError)) {
		return null;
	}

	const parsed = telegramLinkFailureSchema.safeParse(error.body);

	if (!parsed.success) {
		return null;
	}

	return {
		errorCode: parsed.data.errorCode,
		message: parsed.data.message,
		retryAfterSeconds: error.retryAfterSeconds
	};
}

/**
 * The link side of a Telegram request (flow 5.3): `link/start`, `link/complete` and `cancel`, and the session as the
 * lost-answer check. A `link/complete` whose answer was lost has already linked Telegram on the server and cleared the
 * request cookie, so the next poll says `browser-mismatch` or 410; the session then shows the linked Telegram.
 *
 * `userId` is the account that started the link. The session is read with whatever cookie the browser holds now, and
 * another tab may have signed in as somebody else meanwhile (their `link/complete` also says `browser-mismatch`), so
 * the session counts only when it is still that account.
 */
export function createTelegramLinkProtocol(
	gateway: TelegramLinkGateway,
	userId: string
): TelegramRequestProtocol<TelegramLinkConfirmed, TelegramLinkFailureReason> {
	return {
		cancel: (code) => gateway.cancelTelegramLink(code),
		classify: (errorCode) => FAILURE_KIND_BY_ERROR_CODE[errorCode] ?? 'other',
		complete: async (code) => {
			const result = await gateway.completeTelegramLink(code);

			if (!result.ok) {
				return result;
			}

			return result.status === 'pending'
				? { ok: true, status: 'pending' }
				: { confirmed: { telegram: { username: result.telegram.username } }, ok: true, status: 'confirmed' };
		},
		expiredErrorCode: 'link-expired',
		messages: {
			expired: telegramLinkErrorMessageByCode['link-expired'],
			unexpected: telegramLinkErrorMessageByCode.unexpected
		},
		readFailure: readLinkFailure,
		reasonOf: (errorCode) => FAILURE_REASON_BY_ERROR_CODE[errorCode] ?? 'unexpected',
		recoverConfirmation: async () => {
			const session = await gateway.currentSession();

			return session.authenticated && session.user.id === userId && session.telegram !== null
				? { telegram: session.telegram }
				: undefined;
		},
		start: () => gateway.startTelegramLink()
	};
}
