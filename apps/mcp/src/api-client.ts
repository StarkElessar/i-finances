/**
 * Thin HTTP client authenticating as a machine user against `apps/api`,
 * exactly like `apps/web` does over a cookie session — except this one
 * sends a bearer token (see `ApiKeySessionResolver` in `apps/api`) and sets
 * `Origin` itself, since Node's `fetch` never sets it the way a browser
 * would and mutations are rejected without a same-origin `Origin` header.
 */
export type ApiClientConfig = {
	apiKey: string;
	baseUrl: string;
};

export class ApiRequestError extends Error {
	public constructor(
		public readonly status: number,
		public readonly body: unknown
	) {
		super(`API request failed with status ${status}`);
		this.name = 'ApiRequestError';
	}
}

export class ApiClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;

	public constructor(config: ApiClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\/+$/, '');
		this.apiKey = config.apiKey;
	}

	public async get(path: string, query?: Record<string, string | undefined>): Promise<unknown> {
		const url = new URL(`${this.baseUrl}${path}`);

		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}

		return this.send(url, { method: 'GET' });
	}

	public async post(path: string, body: unknown): Promise<unknown> {
		return this.send(new URL(`${this.baseUrl}${path}`), {
			body: JSON.stringify(body),
			method: 'POST'
		});
	}

	public async put(path: string, body: unknown): Promise<unknown> {
		return this.send(new URL(`${this.baseUrl}${path}`), {
			body: JSON.stringify(body),
			method: 'PUT'
		});
	}

	private async send(url: URL, init: { body?: string; method: string }): Promise<unknown> {
		const response = await fetch(url, {
			body: init.body,
			headers: {
				authorization: `Bearer ${this.apiKey}`,
				'content-type': 'application/json',
				origin: this.baseUrl
			},
			method: init.method
		});

		const json = await response.json().catch(() => undefined);

		if (!response.ok) {
			throw new ApiRequestError(response.status, json);
		}

		return json;
	}
}
