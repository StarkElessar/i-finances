/** Flow 5.1 and 5.3: the browser asks `complete` every 2 seconds while the person is in the bot. */
export const TELEGRAM_POLL_INTERVAL_MS = 2_000;

/** A ready link is replaced this long before it expires, so a press never lands on a dead link. */
export const TELEGRAM_LINK_REFRESH_MARGIN_MS = 30_000;

/** Polling stops this long after the request expired on this browser's clock: the server has said 410 by then. */
export const TELEGRAM_DEADLINE_GRACE_MS = 2_000;

export const MILLISECONDS_PER_MINUTE = 60_000;

export const MILLISECONDS_PER_SECOND = 1_000;

/** The shortest and the longest request lifetime the server allows (`TELEGRAM_LOGIN_TTL_MINUTES`, 1–60). */
const MIN_LINK_LIFETIME_MS = MILLISECONDS_PER_MINUTE;

const MAX_LINK_LIFETIME_MS = 60 * MILLISECONDS_PER_MINUTE;

/** The default request lifetime, assumed when `expiresAt` makes no sense on this browser's clock. */
const FALLBACK_LINK_LIFETIME_MS = 10 * MILLISECONDS_PER_MINUTE;

const TELEGRAM_LINK_HOST = 't.me';

/**
 * The link of the button is the server's answer, and only an `https://t.me/...` link may become an anchor: anything
 * else (`javascript:`, a foreign host after a broken setting or a tampered answer) is refused.
 */
export function isTelegramBotUrl(value: string): boolean {
	try {
		const url = new URL(value);

		return url.protocol === 'https:' && url.hostname === TELEGRAM_LINK_HOST && url.port === '' && url.username === ''
			&& url.password === '';
	}
	catch {
		return false;
	}
}

/**
 * The request lifetime as measured from the answer of `start`. `expiresAt` is on the server's clock: on a browser
 * whose clock is off by more than the lifetime, the raw difference is negative (the link would be replaced at once,
 * again and again, until the `start` limit) or huge, so a value the server cannot have set gives way to the default.
 */
export function readLinkLifetimeMs(expiresAt: string, receivedAtMs: number): number {
	const lifetimeMs = Date.parse(expiresAt) - receivedAtMs;

	return Number.isFinite(lifetimeMs) && lifetimeMs >= MIN_LINK_LIFETIME_MS && lifetimeMs <= MAX_LINK_LIFETIME_MS
		? lifetimeMs
		: FALLBACK_LINK_LIFETIME_MS;
}
