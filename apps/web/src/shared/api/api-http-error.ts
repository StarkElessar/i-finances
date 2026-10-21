export class ApiHttpError extends Error {
	public constructor(
		public readonly status: number,
		public readonly body: unknown,
		public readonly url: string,
		/** Whole seconds from the `Retry-After` header of a 429 (or 503), when the server sent one. */
		public readonly retryAfterSeconds?: number
	) {
		super(`API request failed with status ${status}.`);
		this.name = 'ApiHttpError';
	}
}
