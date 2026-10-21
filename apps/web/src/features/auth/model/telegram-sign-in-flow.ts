import { ApiHttpError } from '@/shared/api';

import {
	type CurrentSessionResponse,
	type TelegramSignInCancelResult,
	type TelegramSignInCompleteResult,
	type TelegramSignInErrorCode,
	telegramSignInErrorMessageByCode,
	telegramSignInFailureSchema,
	type TelegramSignInStartResult
} from '@i-finances/contracts';

import type { TelegramSignInFailureReason, TelegramSignInLink, TelegramSignInState } from './telegram-sign-in-state';

/** Flow 5.1: the browser asks `complete` every 2 seconds while the person is in the bot. */
export const TELEGRAM_POLL_INTERVAL_MS = 2_000;

/** A ready link is replaced this long before it expires, so a press never lands on a dead link. */
export const TELEGRAM_LINK_REFRESH_MARGIN_MS = 30_000;

/** Polling stops this long after the request expired on this browser's clock: the server has said 410 by then. */
export const TELEGRAM_DEADLINE_GRACE_MS = 2_000;

/** When a 429 of `start` has no `Retry-After`: the limiter window is 5 minutes (Р11). */
const START_RETRY_FALLBACK_SECONDS = 300;

/** When a 429 of `complete` has no `Retry-After`. */
const POLL_RETRY_FALLBACK_SECONDS = 30;

const MILLISECONDS_PER_MINUTE = 60_000;

const MILLISECONDS_PER_SECOND = 1_000;

/** The shortest and the longest request lifetime the server allows (`TELEGRAM_LOGIN_TTL_MINUTES`, 1–60). */
const MIN_LINK_LIFETIME_MS = MILLISECONDS_PER_MINUTE;

const MAX_LINK_LIFETIME_MS = 60 * MILLISECONDS_PER_MINUTE;

/** The default request lifetime, assumed when `expiresAt` makes no sense on this browser's clock. */
const FALLBACK_LINK_LIFETIME_MS = 10 * MILLISECONDS_PER_MINUTE;

const TELEGRAM_LINK_HOST = 't.me';

export type TelegramSignInGateway = {
	cancelTelegramSignIn(code: string): Promise<TelegramSignInCancelResult>;
	completeTelegramSignIn(code: string): Promise<TelegramSignInCompleteResult>;
	/** Read only when a confirmation may have been lost on the way (see `recoverLostConfirmation`). */
	currentSession(): Promise<CurrentSessionResponse>;
	startTelegramSignIn(): Promise<TelegramSignInStartResult>;
};

export type TelegramSignInFlowOptions = {
	gateway: TelegramSignInGateway;
	/** `document.visibilityState === 'visible'`; polling pauses while the page is hidden. */
	isPageVisible: () => boolean;
	onChange: (state: TelegramSignInState) => void;
};

type TelegramFailure = {
	errorCode: TelegramSignInErrorCode;
	message: string;
	retryAfterSeconds?: number;
};

type TimerName = 'deadline' | 'poll' | 'refresh' | 'retry';

const FAILURE_REASON_BY_ERROR_CODE: Partial<Record<TelegramSignInErrorCode, TelegramSignInFailureReason>> = {
	'account-disabled': 'account-disabled',
	'browser-mismatch': 'browser-mismatch',
	'login-expired': 'expired',
	'login-rejected': 'rejected',
	'rate-limited': 'rate-limited',
	'registration-closed': 'registration-closed'
};

/** A contract failure body, or `null` for anything else: no network, a proxy page, a body the contract does not know. */
function readTelegramFailure(error: unknown): TelegramFailure | null {
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

/**
 * The link of the button is the server's answer, and only an `https://t.me/...` link may become an anchor: anything
 * else (`javascript:`, a foreign host after a broken setting or a tampered answer) is refused.
 */
function isTelegramBotUrl(value: string): boolean {
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
function readLinkLifetimeMs(expiresAt: string, receivedAtMs: number): number {
	const lifetimeMs = Date.parse(expiresAt) - receivedAtMs;

	return Number.isFinite(lifetimeMs) && lifetimeMs >= MIN_LINK_LIFETIME_MS && lifetimeMs <= MAX_LINK_LIFETIME_MS
		? lifetimeMs
		: FALLBACK_LINK_LIFETIME_MS;
}

function toFailedState(failure: TelegramFailure, ttlMinutes?: number): TelegramSignInState {
	return {
		kind: 'failed',
		message: failure.message,
		reason: FAILURE_REASON_BY_ERROR_CODE[failure.errorCode] ?? 'unexpected',
		retryAfterSeconds: failure.retryAfterSeconds,
		ttlMinutes
	};
}

/**
 * The browser side of the Telegram sign-in (flow 5.1), without any UI: `start` once, a link the person presses, then
 * polling of `complete` until the bot answers.
 *
 * Guarantees the page relies on:
 * - `start` runs once per explicit call (mount, «Попробовать снова», a link about to expire), never per render, and
 *   never twice at a time (limit: 10 per 5 minutes);
 * - polling is one request at a time, every 2 seconds, at once when the page becomes visible again, paused while it
 *   is hidden, and stops on the request's expiry, on any final answer and on `dispose` (limit: 300 per 5 minutes);
 * - the code is only the one this browser's own `start` answered;
 * - requests that set or clear the request cookie (`start`, `complete`, `cancel`) never overlap: the browser applies
 *   their `Set-Cookie` in arrival order, and a late «clear» of an old request would wipe the new request's cookie;
 * - a second tab that took over the cookie gets `browser-mismatch` here, which waits for the person's «Начать заново»
 *   rather than restarting by itself, so two tabs never take the cookie from each other in a loop;
 * - the bot link is an `https://t.me/...` link from the answer of `start`, nothing else;
 * - the request lifetime is measured on this browser's clock from the answer of `start`, so a clock that is off by
 *   minutes neither replaces the link in a loop nor keeps it forever;
 * - a confirmation whose answer was lost (no network, the timeout) is found through the session, not shown as expired.
 */
export class TelegramSignInFlow {
	private state: TelegramSignInState = { kind: 'idle' };
	/** Bumped by every restart and by `dispose`; an answer of an older generation is ignored. */
	private generation = 0;
	private disposed = false;
	private pollInFlight = false;
	/**
	 * A poll of the current request got no answer (no network, the 15 s timeout, a cut body). Its answer may have been
	 * `confirmed`: the server then used the request up, and the next poll says 410 (the answer was lost before its
	 * headers) or 403 `browser-mismatch` (its headers arrived: the session cookie is set and the request cookie cleared).
	 */
	private pollAnswerLost = false;
	/** The ready link expired while the page was hidden: replace it when the page is visible again. */
	private linkStale = false;
	/** The last request that may set or clear the request cookie, settled (never rejects). */
	private cookieRequest: Promise<void> = Promise.resolve();
	private readonly timers = new Map<TimerName, ReturnType<typeof setTimeout>>();

	public constructor(private readonly options: TelegramSignInFlowOptions) {}

	public getState(): TelegramSignInState {
		return this.state;
	}

	/** First start and every «Попробовать снова» / «Начать заново». Ignored while a start is already running. */
	public start(): void {
		void this.restart();
	}

	/** The person pressed the bot link (the browser follows the link by itself). */
	public handleLinkOpened(): void {
		const state = this.state;

		if (state.kind !== 'ready') {
			return;
		}

		this.clearTimer('refresh');
		this.setState({ connectionLost: false, kind: 'waiting', link: state.link });
		this.setTimer('deadline', Math.max(0, state.link.expiresAtMs + TELEGRAM_DEADLINE_GRACE_MS - Date.now()), () => {
			if (this.state.kind === 'waiting') {
				this.clearTimers();
				this.setState({
					kind: 'failed',
					message: telegramSignInErrorMessageByCode['login-expired'],
					reason: 'expired',
					ttlMinutes: state.link.ttlMinutes
				});
			}
		});
		this.setTimer('poll', TELEGRAM_POLL_INTERVAL_MS, () => void this.poll());
	}

	/** `visibilitychange`: back from the bot means «check now». */
	public handleVisibilityChange(): void {
		if (!this.options.isPageVisible()) {
			return;
		}

		if (this.state.kind === 'waiting') {
			void this.poll();
			return;
		}

		if (this.state.kind === 'ready' && this.linkStale) {
			void this.restart();
		}
	}

	/** «Отмена» while waiting: abandon this request and prepare a new link. */
	public cancel(): void {
		const state = this.state;

		if (state.kind === 'waiting') {
			void this.restart(state.link.code);
		}
	}

	/** Leaving the page: no timers, no more requests. An abandoned request simply expires on the server. */
	public dispose(): void {
		this.disposed = true;
		this.generation += 1;
		this.clearTimers();
	}

	private async restart(cancelCode?: string): Promise<void> {
		if (this.disposed || this.state.kind === 'preparing') {
			return;
		}

		this.clearTimers();
		this.linkStale = false;
		this.pollAnswerLost = false;
		this.generation += 1;

		const generation = this.generation;

		this.setState({ kind: 'preparing' });

		await this.cookieRequest;

		if (cancelCode !== undefined) {
			await this.track(this.options.gateway.cancelTelegramSignIn(cancelCode)).catch(() => undefined);
		}

		if (this.isStale(generation)) {
			return;
		}

		try {
			const result = await this.track(this.options.gateway.startTelegramSignIn());

			if (this.isStale(generation)) {
				return;
			}

			if (!result.ok) {
				this.handleStartFailure({ errorCode: result.errorCode, message: result.message });
				return;
			}

			if (!isTelegramBotUrl(result.botUrl)) {
				this.setState({ kind: 'failed', message: telegramSignInErrorMessageByCode.unexpected, reason: 'unexpected' });
				return;
			}

			const receivedAtMs = Date.now();
			const expiresAtMs = receivedAtMs + readLinkLifetimeMs(result.expiresAt, receivedAtMs);
			const link: TelegramSignInLink = {
				appUrl: result.appUrl,
				botUrl: result.botUrl,
				code: result.code,
				expiresAtMs,
				ttlMinutes: Math.max(1, Math.round((expiresAtMs - Date.now()) / MILLISECONDS_PER_MINUTE))
			};

			this.setState({ kind: 'ready', link });
			this.setTimer('refresh', Math.max(0, expiresAtMs - TELEGRAM_LINK_REFRESH_MARGIN_MS - Date.now()), () => {
				if (this.state.kind !== 'ready') {
					return;
				}

				if (this.options.isPageVisible()) {
					void this.restart();
					return;
				}

				this.linkStale = true;
			});
		}
		catch (error: unknown) {
			if (this.isStale(generation)) {
				return;
			}

			const failure = readTelegramFailure(error);

			if (failure === null) {
				this.setState({
					kind: 'failed',
					message: telegramSignInErrorMessageByCode.unexpected,
					reason: 'network'
				});
				return;
			}

			this.handleStartFailure(failure);
		}
	}

	private handleStartFailure(failure: TelegramFailure): void {
		if (failure.errorCode === 'telegram-unavailable') {
			this.setState({ kind: 'unavailable' });
			return;
		}

		if (failure.errorCode === 'rate-limited') {
			const retryAfterSeconds = failure.retryAfterSeconds ?? START_RETRY_FALLBACK_SECONDS;

			this.setState(toFailedState({ ...failure, retryAfterSeconds }));
			this.setTimer('retry', retryAfterSeconds * MILLISECONDS_PER_SECOND, () => void this.restart());
			return;
		}

		this.setState(toFailedState(failure));
	}

	private async poll(): Promise<void> {
		this.clearTimer('poll');

		const state = this.state;

		if (state.kind !== 'waiting' || this.pollInFlight || this.disposed || !this.options.isPageVisible()) {
			// Hidden: no timer is left, `visibilitychange` resumes. In flight: that request schedules the next one.
			return;
		}

		const generation = this.generation;

		this.pollInFlight = true;

		try {
			const result = await this.track(this.options.gateway.completeTelegramSignIn(state.link.code));

			if (this.isStale(generation) || this.state.kind !== 'waiting') {
				return;
			}

			if (!result.ok) {
				this.handlePollFailure({ errorCode: result.errorCode, message: result.message }, state.link);
				return;
			}

			if (result.status === 'pending') {
				this.setConnectionLost(false);
				this.setTimer('poll', TELEGRAM_POLL_INTERVAL_MS, () => void this.poll());
				return;
			}

			this.clearTimers();
			this.setState({ hasHousehold: result.hasHousehold, isNewUser: result.isNewUser, kind: 'confirmed' });
		}
		catch (error: unknown) {
			if (this.isStale(generation) || this.state.kind !== 'waiting') {
				return;
			}

			const failure = readTelegramFailure(error);

			if (failure === null) {
				// No network or a proxy error page: the request may still be fine, keep asking.
				this.pollAnswerLost = true;
				this.setConnectionLost(true);
				this.setTimer('poll', TELEGRAM_POLL_INTERVAL_MS, () => void this.poll());
				return;
			}

			this.handlePollFailure(failure, state.link);
		}
		finally {
			this.pollInFlight = false;
		}
	}

	private handlePollFailure(failure: TelegramFailure, link: TelegramSignInLink): void {
		if (failure.errorCode === 'rate-limited') {
			const retryAfterSeconds = failure.retryAfterSeconds ?? POLL_RETRY_FALLBACK_SECONDS;

			this.setTimer('poll', retryAfterSeconds * MILLISECONDS_PER_SECOND, () => void this.poll());
			return;
		}

		if (failure.errorCode === 'unexpected') {
			this.setConnectionLost(true);
			this.setTimer('poll', TELEGRAM_POLL_INTERVAL_MS, () => void this.poll());
			return;
		}

		this.clearTimers();

		if (failure.errorCode === 'telegram-unavailable') {
			this.setState({ kind: 'unavailable' });
			return;
		}

		if (this.pollAnswerLost && (failure.errorCode === 'login-expired' || failure.errorCode === 'browser-mismatch')) {
			void this.recoverLostConfirmation(failure, link);
			return;
		}

		this.setState(toFailedState(failure, link.ttlMinutes));
	}

	/**
	 * After a poll without an answer, 410 or `browser-mismatch` may mean «you are signed in, the answer was lost»: `used`
	 * answers 410 like an expired request, and a cleared request cookie looks like another browser. The session decides:
	 * signed in shows the identity card as after any confirmation (the person still sees whose account it is), otherwise
	 * the failure stands as it is.
	 */
	private async recoverLostConfirmation(failure: TelegramFailure, link: TelegramSignInLink): Promise<void> {
		const generation = this.generation;
		let session: CurrentSessionResponse | undefined;

		try {
			session = await this.options.gateway.currentSession();
		}
		catch {
			session = undefined;
		}

		if (this.isStale(generation) || this.state.kind !== 'waiting') {
			return;
		}

		if (session?.authenticated === true) {
			this.setState({ hasHousehold: session.household !== null, isNewUser: false, kind: 'confirmed' });
			return;
		}

		this.setState(toFailedState(failure, link.ttlMinutes));
	}

	private setConnectionLost(connectionLost: boolean): void {
		const state = this.state;

		if (state.kind === 'waiting' && state.connectionLost !== connectionLost) {
			this.setState({ ...state, connectionLost });
		}
	}

	private track<TResult>(request: Promise<TResult>): Promise<TResult> {
		this.cookieRequest = request.then(() => undefined, () => undefined);

		return request;
	}

	private isStale(generation: number): boolean {
		return this.disposed || generation !== this.generation;
	}

	private setState(state: TelegramSignInState): void {
		this.state = state;
		this.options.onChange(state);
	}

	private setTimer(name: TimerName, delayMs: number, callback: () => void): void {
		this.clearTimer(name);
		this.timers.set(name, setTimeout(() => {
			this.timers.delete(name);
			callback();
		}, delayMs));
	}

	private clearTimer(name: TimerName): void {
		const handle = this.timers.get(name);

		if (handle !== undefined) {
			clearTimeout(handle);
			this.timers.delete(name);
		}
	}

	private clearTimers(): void {
		for (const name of [...this.timers.keys()]) {
			this.clearTimer(name);
		}
	}
}
