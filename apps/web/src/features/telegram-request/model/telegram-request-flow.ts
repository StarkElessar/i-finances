import {
	isTelegramBotUrl,
	MILLISECONDS_PER_MINUTE,
	MILLISECONDS_PER_SECOND,
	readLinkLifetimeMs,
	TELEGRAM_DEADLINE_GRACE_MS,
	TELEGRAM_LINK_REFRESH_MARGIN_MS,
	TELEGRAM_POLL_INTERVAL_MS
} from './telegram-request-link';
import type { TelegramRequestFailure, TelegramRequestProtocol } from './telegram-request-protocol';
import type { TelegramRequestLink, TelegramRequestState } from './telegram-request-state';

/** When a 429 of `start` has no `Retry-After`: the limiter window is 5 minutes (Р11). */
const START_RETRY_FALLBACK_SECONDS = 300;

/** When a 429 of `complete` has no `Retry-After`. */
const POLL_RETRY_FALLBACK_SECONDS = 30;

export type TelegramRequestFlowOptions<TConfirmed extends object, TReason extends string> = {
	/** `document.visibilityState === 'visible'`; polling pauses while the page is hidden. */
	isPageVisible: () => boolean;
	onChange: (state: TelegramRequestState<TConfirmed, TReason>) => void;
	protocol: TelegramRequestProtocol<TConfirmed, TReason>;
};

type TimerName = 'deadline' | 'poll' | 'refresh' | 'retry';

/**
 * The browser side of a Telegram request (the sign-in, flow 5.1, and the link, flow 5.3), without any UI: `start` once,
 * a link the person presses, then polling of `complete` until the bot answers. What differs between the two kinds is the
 * `protocol`; the guarantees below are the same for both.
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
export class TelegramRequestFlow<TConfirmed extends object, TReason extends string> {
	private state: TelegramRequestState<TConfirmed, TReason> = { kind: 'idle' };
	/** Bumped by every restart and by `dispose`; an answer of an older generation is ignored. */
	private generation = 0;
	private disposed = false;
	private pollInFlight = false;
	/**
	 * A poll of the current request got no answer (no network, the 15 s timeout, a cut body). Its answer may have been
	 * `confirmed`: the server then used the request up, and the next poll says 410 (the answer was lost before its
	 * headers) or 403 `browser-mismatch` (its headers arrived: the cookie is set and the request cookie cleared).
	 */
	private pollAnswerLost = false;
	/** The ready link expired while the page was hidden: replace it when the page is visible again. */
	private linkStale = false;
	/** The last request that may set or clear the request cookie, settled (never rejects). */
	private cookieRequest: Promise<void> = Promise.resolve();
	private readonly timers = new Map<TimerName, ReturnType<typeof setTimeout>>();

	public constructor(private readonly options: TelegramRequestFlowOptions<TConfirmed, TReason>) {}

	public getState(): TelegramRequestState<TConfirmed, TReason> {
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
					message: this.options.protocol.messages.expired,
					reason: this.options.protocol.reasonOf(this.options.protocol.expiredErrorCode),
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

		const { protocol } = this.options;

		this.clearTimers();
		this.linkStale = false;
		this.pollAnswerLost = false;
		this.generation += 1;

		const generation = this.generation;

		this.setState({ kind: 'preparing' });

		await this.cookieRequest;

		if (cancelCode !== undefined) {
			await this.track(protocol.cancel(cancelCode)).catch(() => undefined);
		}

		if (this.isStale(generation)) {
			return;
		}

		try {
			const result = await this.track(protocol.start());

			if (this.isStale(generation)) {
				return;
			}

			if (!result.ok) {
				this.handleStartFailure({ errorCode: result.errorCode, message: result.message });
				return;
			}

			if (!isTelegramBotUrl(result.botUrl)) {
				this.setState({ kind: 'failed', message: protocol.messages.unexpected, reason: 'unexpected' });
				return;
			}

			const receivedAtMs = Date.now();
			const expiresAtMs = receivedAtMs + readLinkLifetimeMs(result.expiresAt, receivedAtMs);
			const link: TelegramRequestLink = {
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

			const failure = protocol.readFailure(error);

			if (failure === null) {
				this.setState({
					kind: 'failed',
					message: protocol.messages.unexpected,
					reason: 'network'
				});
				return;
			}

			this.handleStartFailure(failure);
		}
	}

	private handleStartFailure(failure: TelegramRequestFailure): void {
		const kind = this.options.protocol.classify(failure.errorCode);

		if (kind === 'unavailable') {
			this.setState({ kind: 'unavailable' });
			return;
		}

		if (kind === 'rate-limited') {
			const retryAfterSeconds = failure.retryAfterSeconds ?? START_RETRY_FALLBACK_SECONDS;

			this.setState(this.toFailedState({ ...failure, retryAfterSeconds }));
			this.setTimer('retry', retryAfterSeconds * MILLISECONDS_PER_SECOND, () => void this.restart());
			return;
		}

		this.setState(this.toFailedState(failure));
	}

	private async poll(): Promise<void> {
		this.clearTimer('poll');

		const state = this.state;

		if (state.kind !== 'waiting' || this.pollInFlight || this.disposed || !this.options.isPageVisible()) {
			// Hidden: no timer is left, `visibilitychange` resumes. In flight: that request schedules the next one.
			return;
		}

		const { protocol } = this.options;
		const generation = this.generation;

		this.pollInFlight = true;

		try {
			const result = await this.track(protocol.complete(state.link.code));

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
			this.setState({ kind: 'confirmed', ...result.confirmed });
		}
		catch (error: unknown) {
			if (this.isStale(generation) || this.state.kind !== 'waiting') {
				return;
			}

			const failure = protocol.readFailure(error);

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

	private handlePollFailure(failure: TelegramRequestFailure, link: TelegramRequestLink): void {
		const kind = this.options.protocol.classify(failure.errorCode);

		if (kind === 'rate-limited') {
			const retryAfterSeconds = failure.retryAfterSeconds ?? POLL_RETRY_FALLBACK_SECONDS;

			this.setTimer('poll', retryAfterSeconds * MILLISECONDS_PER_SECOND, () => void this.poll());
			return;
		}

		if (kind === 'transient') {
			this.setConnectionLost(true);
			this.setTimer('poll', TELEGRAM_POLL_INTERVAL_MS, () => void this.poll());
			return;
		}

		this.clearTimers();

		if (kind === 'unavailable') {
			this.setState({ kind: 'unavailable' });
			return;
		}

		if (this.pollAnswerLost && (kind === 'expired' || kind === 'browser-mismatch')) {
			void this.recoverLostConfirmation(failure, link);
			return;
		}

		this.setState(this.toFailedState(failure, link.ttlMinutes));
	}

	/**
	 * After a poll without an answer, 410 or `browser-mismatch` may mean «it went through, the answer was lost»: `used`
	 * answers 410 like an expired request, and a cleared request cookie looks like another browser. The server decides:
	 * if it shows the confirmation, the flow ends as after any confirmation (the person still sees the result),
	 * otherwise the failure stands as it is.
	 */
	private async recoverLostConfirmation(failure: TelegramRequestFailure, link: TelegramRequestLink): Promise<void> {
		const generation = this.generation;
		let confirmed: TConfirmed | undefined;

		try {
			confirmed = await this.options.protocol.recoverConfirmation();
		}
		catch {
			confirmed = undefined;
		}

		if (this.isStale(generation) || this.state.kind !== 'waiting') {
			return;
		}

		if (confirmed !== undefined) {
			this.setState({ kind: 'confirmed', ...confirmed });
			return;
		}

		this.setState(this.toFailedState(failure, link.ttlMinutes));
	}

	private toFailedState(failure: TelegramRequestFailure, ttlMinutes?: number): TelegramRequestState<TConfirmed, TReason> {
		return {
			kind: 'failed',
			message: failure.message,
			reason: this.options.protocol.reasonOf(failure.errorCode),
			retryAfterSeconds: failure.retryAfterSeconds,
			ttlMinutes
		};
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

	private setState(state: TelegramRequestState<TConfirmed, TReason>): void {
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
