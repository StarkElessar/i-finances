export class ApiRequestError extends Error {
	public constructor(
		public readonly status: number,
		public readonly body: unknown
	) {
		super(`API request failed with status ${status}`);
		this.name = 'ApiRequestError';
	}
}
