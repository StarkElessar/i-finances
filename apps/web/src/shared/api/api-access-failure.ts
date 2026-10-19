import { isHouseholdRequiredFailure } from '@i-finances/contracts';

/**
 * What an API failure says about the caller's access, as opposed to a problem with the request itself:
 * - `unauthenticated`: 401, the session is gone (expired, signed out elsewhere, ended when a member was removed, Р7);
 * - `household-required`: 403 `household-required`, signed in but without a household (onboarding, Р4, Р8).
 */
export type ApiAccessFailure = 'household-required' | 'unauthenticated';

const UNAUTHORIZED_STATUS = 401;

const FORBIDDEN_STATUS = 403;

/**
 * Reads an access failure out of an HTTP failure. Any other 403 (a foreign origin, an owner-only action) is a refusal
 * of that one request and says nothing about the session, so it is not an access failure.
 */
export function readApiAccessFailure(status: number, body: unknown): ApiAccessFailure | null {
	if (status === UNAUTHORIZED_STATUS) {
		return 'unauthenticated';
	}

	if (status === FORBIDDEN_STATUS && isHouseholdRequiredFailure(body)) {
		return 'household-required';
	}

	return null;
}

type ApiAccessFailureListener = (failure: ApiAccessFailure) => void;

const listeners = new Set<ApiAccessFailureListener>();

/**
 * Subscribes to access failures of every `ApiClient` in the app. The data clients are module singletons, so the
 * session layer cannot hand each of them a callback; this is the one place they all report to. Returns the unsubscribe.
 */
export function subscribeToApiAccessFailures(listener: ApiAccessFailureListener): () => void {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

export function notifyApiAccessFailure(failure: ApiAccessFailure): void {
	for (const listener of [...listeners]) {
		listener(failure);
	}
}
