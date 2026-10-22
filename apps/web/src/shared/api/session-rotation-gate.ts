import { type ApiAccessFailure, notifyApiAccessFailure } from './api-access-failure';

/**
 * A password change replaces the token of the current session (`session-rotation.md`): the browser gets the new cookie
 * with the answer, and a request that left with the old cookie before that answers 401. That 401 says nothing about the
 * session, so it must not sign the person out.
 *
 * Every request takes a number when it leaves. While a change is in flight, 401s are held back; when the change
 * succeeds, the held ones (and any later 401 of a request that left earlier) are dropped; when it fails, the held ones
 * are reported as usual. A change is never held longer than `SESSION_ROTATION_HOLD_LIMIT_MS`: after that it counts as
 * failed, so a request that never answers cannot hide a real end of the session.
 */

/** The longest a change may hold 401s back; the change request itself gives up earlier (`security-client.ts`). */
export const SESSION_ROTATION_HOLD_LIMIT_MS = 30_000;

let requestCounter = 0;

/** The number taken when the last successful change settled: requests numbered below it left with the old cookie. */
let rotatedAt = 0;

let inFlightRotations = 0;

/**
 * The latest number among the held 401s, `undefined` when none is held. One number is enough: a held 401 is either
 * dropped (it left before a successful change) or reported once, and the latest one decides whether any is left to report.
 */
let latestHeldStartedAt: number | undefined;

export function markApiRequestStart(): number {
	requestCounter += 1;

	return requestCounter;
}

/** Every access failure of the shared clients goes through here, with the number the request took when it left. */
export function reportApiAccessFailure(failure: ApiAccessFailure, startedAt: number): void {
	if (failure === 'unauthenticated') {
		if (inFlightRotations > 0) {
			latestHeldStartedAt = Math.max(latestHeldStartedAt ?? startedAt, startedAt);
			return;
		}

		if (startedAt < rotatedAt) {
			return;
		}
	}

	notifyApiAccessFailure(failure);
}

/**
 * Call right before sending the password change. The returned function settles it: `rotated` when the server accepted
 * the new password (the browser now holds the new cookie), `failed` otherwise. A change not settled within
 * `SESSION_ROTATION_HOLD_LIMIT_MS` settles itself as `failed`.
 */
export function beginSessionRotation(): (outcome: 'failed' | 'rotated') => void {
	inFlightRotations += 1;

	let settled = false;
	// The callback runs after `settle` below exists.
	const holdLimit = setTimeout(() => settle('failed'), SESSION_ROTATION_HOLD_LIMIT_MS);

	const settle = (outcome: 'failed' | 'rotated'): void => {
		if (settled) {
			return;
		}

		settled = true;
		clearTimeout(holdLimit);
		inFlightRotations -= 1;

		if (outcome === 'rotated') {
			rotatedAt = markApiRequestStart();

			if (latestHeldStartedAt !== undefined && latestHeldStartedAt < rotatedAt) {
				latestHeldStartedAt = undefined;
			}
		}

		if (inFlightRotations === 0 && latestHeldStartedAt !== undefined) {
			const startedAt = latestHeldStartedAt;

			latestHeldStartedAt = undefined;
			reportApiAccessFailure('unauthenticated', startedAt);
		}
	};

	return settle;
}

/** For tests: forget every held failure and every rotation. */
export function resetSessionRotationGate(): void {
	requestCounter = 0;
	rotatedAt = 0;
	inFlightRotations = 0;
	latestHeldStartedAt = undefined;
}
