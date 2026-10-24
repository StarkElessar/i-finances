export type PasswordVerificationAdmission =
	| { allowed: true; release: () => void }
	| { allowed: false; retryAfterSeconds: number };

export type PasswordVerificationLimiterOptions = {
	maxConcurrent: number;
	maxQueue: number;
	queueTimeoutMilliseconds: number;
	now?: () => number;
	setTimer?: (callback: () => void, delayMilliseconds: number) => ReturnType<typeof setTimeout>;
	clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

type WaitingVerification = {
	expiresAt: number;
	resolve: (admission: PasswordVerificationAdmission) => void;
	timer: ReturnType<typeof setTimeout>;
};

/** A process-wide FIFO admission gate for public password sign-in, including dummy verifications. */
export class PasswordVerificationLimiter {
	private active = 0;
	private readonly queue = new Map<symbol, WaitingVerification>();
	private readonly now: () => number;
	private readonly setTimer: NonNullable<PasswordVerificationLimiterOptions['setTimer']>;
	private readonly clearTimer: NonNullable<PasswordVerificationLimiterOptions['clearTimer']>;

	public constructor(private readonly options: PasswordVerificationLimiterOptions) {
		this.now = options.now ?? (() => Date.now());
		this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
		this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
	}

	public async acquire(): Promise<PasswordVerificationAdmission> {
		if (this.active < this.options.maxConcurrent) {
			this.active += 1;

			return this.createAdmission();
		}

		if (this.queue.size >= this.options.maxQueue) {
			return this.refuse();
		}

		return new Promise((resolve) => {
			const id = Symbol();
			const expiresAt = this.now() + this.options.queueTimeoutMilliseconds;
			const timer = this.setTimer(() => {
				if (this.queue.delete(id)) {
					resolve(this.refuse());
				}
			}, this.options.queueTimeoutMilliseconds);

			this.queue.set(id, { expiresAt, resolve, timer });
		});
	}

	private createAdmission(): Extract<PasswordVerificationAdmission, { allowed: true }> {
		let released = false;

		return {
			allowed: true,
			release: () => {
				if (released) {
					return;
				}

				released = true;
				this.active -= 1;
				this.drainQueue();
			}
		};
	}

	private drainQueue(): void {
		while (this.active < this.options.maxConcurrent) {
			const first = this.queue.entries().next().value;

			if (first === undefined) {
				return;
			}

			const [id, waiting] = first;

			this.queue.delete(id);
			this.clearTimer(waiting.timer);

			// A busy event loop may deliver release before the timeout callback: the deadline still applies.
			if (waiting.expiresAt <= this.now()) {
				waiting.resolve(this.refuse());
			}
			else {
				this.active += 1;
				waiting.resolve(this.createAdmission());
			}
		}
	}

	private refuse(): Extract<PasswordVerificationAdmission, { allowed: false }> {
		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil(this.options.queueTimeoutMilliseconds / 1000))
		};
	}
}
