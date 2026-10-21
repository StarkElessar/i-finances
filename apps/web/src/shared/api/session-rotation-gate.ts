import { type ApiAccessFailure, notifyApiAccessFailure } from './api-access-failure';

/**
 * A password change replaces the token of the current session (`session-rotation.md`): the browser gets the new cookie
 * with the answer, and a request that left with the old cookie before that answers 401. That 401 says nothing about the
 * session, so it must not sign the person out.
 *
 * Every request takes a number when it leaves. While a change is in flight, 401s are held back; when the change
 * succeeds, the held ones (and any later 401 of a request that left earlier) are dropped; when it fails, the held ones
 * are reported as usual.
 */
type HeldFailure = { failure: ApiAccessFailure; startedAt: number };

let requestCounter = 0;

/** The number taken when the last successful change settled: requests numbered below it left with the old cookie. */
let rotatedAt = 0;

let inFlightRotations = 0;

let held: HeldFailure[] = [];

export function markApiRequestStart(): number {
	requestCounter += 1;

	return requestCounter;
}

/** Every access failure of the shared clients goes through here, with the number the request took when it left. */
export function reportApiAccessFailure(failure: ApiAccessFailure, startedAt: number): void {
	if (failure === 'unauthenticated') {
		if (inFlightRotations > 0) {
			held.push({ failure, startedAt });
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
 * the new password (the browser now holds the new cookie), `failed` otherwise.
 */
export function beginSessionRotation(): (outcome: 'failed' | 'rotated') => void {
	inFlightRotations += 1;

	let settled = false;

	return (outcome) => {
		if (settled) {
			return;
		}

		settled = true;
		inFlightRotations -= 1;

		if (outcome === 'rotated') {
			rotatedAt = markApiRequestStart();
			held = held.filter((entry) => entry.startedAt >= rotatedAt);
		}

		if (inFlightRotations === 0) {
			const toReport = held;

			held = [];

			for (const entry of toReport) {
				reportApiAccessFailure(entry.failure, entry.startedAt);
			}
		}
	};
}

/** For tests: forget every held failure and every rotation. */
export function resetSessionRotationGate(): void {
	requestCounter = 0;
	rotatedAt = 0;
	inFlightRotations = 0;
	held = [];
}
