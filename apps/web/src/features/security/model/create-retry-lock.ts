/** A wait named by a 429 (`Retry-After`) that a form rests for. */
export type RetryLock = {
	/** Ends the wait for good (the form is gone): a running wait is cleared and a later `lockFor` does nothing. */
	dispose: () => void;
	/** Rests for `seconds`, then calls `onUnlock`; a newer wait replaces a running one. `false` once disposed. */
	lockFor: (seconds: number, onUnlock: () => void) => boolean;
};

const MILLISECONDS_PER_SECOND = 1_000;

/**
 * The timer behind «Повторите через N минут». The answer of a request can come after the form was closed, so a wait
 * started then would outlive the form; after `dispose` no wait starts.
 */
export function createRetryLock(): RetryLock {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	const clear = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	return {
		dispose: () => {
			disposed = true;
			clear();
		},
		lockFor: (seconds, onUnlock) => {
			if (disposed) {
				return false;
			}

			clear();
			timer = setTimeout(() => {
				timer = undefined;
				onUnlock();
			}, seconds * MILLISECONDS_PER_SECOND);

			return true;
		}
	};
}
