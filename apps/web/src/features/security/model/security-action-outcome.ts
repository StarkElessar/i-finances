import type {
	DeleteSecurityPasskeyResult,
	RevokeOtherSecuritySessionsResult,
	RevokeSecuritySessionResult
} from '@i-finances/contracts';

/** What deleting a passkey came to; one entry per state of the passkey block of `D-Security`. */
export type DeletePasskeyOutcome =
	| { kind: 'deleted' }
	/** The key is already gone (deleted elsewhere): the list is simply refreshed, nothing is shown as a failure. */
	| { kind: 'gone' }
	/** 409: the only way to sign in is this key. A hint («сначала добавьте другой ключ»), not a failure. */
	| { kind: 'last-passkey' }
	| { kind: 'failed'; message: string };

export function describeDeletePasskeyResult(result: DeleteSecurityPasskeyResult): DeletePasskeyOutcome {
	if (result.ok) {
		return { kind: 'deleted' };
	}

	switch (result.errorCode) {
		case 'last-passkey':
			return { kind: 'last-passkey' };

		case 'not-found':
			return { kind: 'gone' };

		default:
			return { kind: 'failed', message: result.message };
	}
}

/** What ending one session came to. */
export type RevokeSessionOutcome =
	| { kind: 'revoked' }
	/** 404: the session is already gone; the list is refreshed. */
	| { kind: 'gone' }
	/** 409 `current-session`: the person's own session has no «Завершить», so this only means the list was stale. Not a failure. */
	| { kind: 'current' }
	| { kind: 'failed'; message: string };

export function describeRevokeSessionResult(result: RevokeSecuritySessionResult): RevokeSessionOutcome {
	if (result.ok) {
		return { kind: 'revoked' };
	}

	switch (result.errorCode) {
		case 'current-session':
			return { kind: 'current' };

		case 'not-found':
			return { kind: 'gone' };

		default:
			return { kind: 'failed', message: result.message };
	}
}

export type RevokeOtherSessionsOutcome =
	| { kind: 'revoked'; revokedSessionCount: number }
	| { kind: 'failed'; message: string };

export function describeRevokeOtherSessionsResult(result: RevokeOtherSecuritySessionsResult): RevokeOtherSessionsOutcome {
	return result.ok
		? { kind: 'revoked', revokedSessionCount: result.revokedSessionCount }
		: { kind: 'failed', message: result.message };
}
