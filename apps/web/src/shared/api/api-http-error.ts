export class ApiHttpError extends Error {
	public constructor(
		public readonly status: number,
		public readonly body: unknown,
		public readonly url: string
	) {
		super(`API request failed with status ${status}.`);
		this.name = 'ApiHttpError';
	}
}
