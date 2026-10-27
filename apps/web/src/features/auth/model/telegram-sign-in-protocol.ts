import { ApiHttpError } from '@/shared/api';

import type { TelegramRequestFailure, TelegramRequestFailureKind, TelegramRequestProtocol } from '@/features/telegram-request';

import {
	type CurrentSessionResponse,
	type TelegramSignInCancelResult,
	type TelegramSignInCompleteResult,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode,
	telegramSignInFailureSchema,
	type TelegramSignInStartResult
} from '@i-finances/contracts';

import type { TelegramSignInConfirmed, TelegramSignInFailureReason } from './telegram-sign-in-state';

export type TelegramSignInGateway = {
	cancelTelegramSignIn(code: string): Promise<TelegramSignInCancelResult>;
	completeTelegramSignIn(code: string): Promise<TelegramSignInCompleteResult>;
	/** Read only when a confirmation may have been lost on the way (see `recoverConfirmation` of the protocol). */
	currentSession(): Promise<CurrentSessionResponse>;
	startTelegramSignIn(invitationToken?: string): Promise<TelegramSignInStartResult>;
};

const FAILURE_REASON_BY_ERROR_CODE: Partial<Record<string, TelegramSignInFailureReason>> = {
	'account-disabled': 'account-disabled',
	'browser-mismatch': 'browser-mismatch',
	'login-expired': 'expired',
	'login-rejected': 'rejected',
	'rate-limited': 'rate-limited',
	'registration-closed': 'registration-closed'
} satisfies Partial<Record<TelegramSignInErrorCode, TelegramSignInFailureReason>>;

const FAILURE_KIND_BY_ERROR_CODE: Partial<Record<string, TelegramRequestFailureKind>> = {
	'browser-mismatch': 'browser-mismatch',
	'login-expired': 'expired',
	'rate-limited': 'rate-limited',
	'telegram-unavailable': 'unavailable',
	unexpected: 'transient'
} satisfies Partial<Record<TelegramSignInErrorCode, TelegramRequestFailureKind>>;

/** A contract failure body, or `null` for anything else: no network, a proxy page, a body the contract does not know. */
function readSignInFailure(error: unknown): TelegramRequestFailure | null {
	if (!(error instanceof ApiHttpError)) {
		return null;
	}

	const parsed = telegramSignInFailureSchema.safeParse(error.body);

	if (!parsed.success) {
		return null;
	}

	return {
		errorCode: parsed.data.errorCode,
		message: parsed.data.message,
		retryAfterSeconds: error.retryAfterSeconds
	};
}

/** The sign-in side of a Telegram request: `start`, `complete` and `cancel` of flow 5.1, and the session as the lost-answer check. */
export function createTelegramSignInProtocol(
	gateway: TelegramSignInGateway,
	invitationToken?: string
): TelegramRequestProtocol<TelegramSignInConfirmed, TelegramSignInFailureReason> {
	return {
		cancel: (code) => gateway.cancelTelegramSignIn(code),
		classify: (errorCode) => FAILURE_KIND_BY_ERROR_CODE[errorCode] ?? 'other',
		complete: async (code) => {
			const result = await gateway.completeTelegramSignIn(code);

			if (!result.ok) {
				return result;
			}

			return result.status === 'pending'
				? { ok: true, status: 'pending' }
				: {
					confirmed: { hasHousehold: result.hasHousehold, isNewUser: result.isNewUser },
					ok: true,
					status: 'confirmed'
				};
		},
		expiredErrorCode: 'login-expired',
		messages: {
			expired: telegramSignInErrorMessageByCode['login-expired'],
			unexpected: telegramSignInErrorMessageByCode.unexpected
		},
		readFailure: readSignInFailure,
		reasonOf: (errorCode) => FAILURE_REASON_BY_ERROR_CODE[errorCode] ?? 'unexpected',
		// Signed in shows the identity card as after any confirmation (the person still sees whose account it is).
		recoverConfirmation: async () => {
			const session = await gateway.currentSession();

			return session.authenticated ? { hasHousehold: session.household !== null, isNewUser: false, isRecovered: true } : undefined;
		},
		start: () => invitationToken === undefined ? gateway.startTelegramSignIn() : gateway.startTelegramSignIn(invitationToken)
	};
}
