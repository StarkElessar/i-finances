export type ApiResponseSchema<TResponse> = {
	parse(value: unknown): TResponse;
};

export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
	body?: unknown;
};

export type ApiClientOptions = {
	baseUrl?: string;
	fetcher?: typeof globalThis.fetch;
};

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

/**
 * Owns browser HTTP concerns while leaving feature clients focused on APIs.
 */
export class ApiClient {
	private readonly baseUrl: string;
	private readonly fetcher: typeof globalThis.fetch;

	public constructor(options: ApiClientOptions = {}) {
		this.baseUrl = options.baseUrl ?? '';
		this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
	}

	public async get<TResponse>(
		path: string,
		schema: ApiResponseSchema<TResponse>
	): Promise<TResponse> {
		return this.request(path, schema, { method: 'GET' });
	}

	public async post<TResponse>(
		path: string,
		body: unknown,
		schema: ApiResponseSchema<TResponse>
	): Promise<TResponse> {
		return this.request(path, schema, {
			body,
			method: 'POST'
		});
	}

	public async put<TResponse>(
		path: string,
		body: unknown,
		schema: ApiResponseSchema<TResponse>
	): Promise<TResponse> {
		return this.request(path, schema, {
			body,
			method: 'PUT'
		});
	}

	private async request<TResponse>(
		path: string,
		schema: ApiResponseSchema<TResponse>,
		options: ApiRequestOptions
	): Promise<TResponse> {
		const url = this.createUrl(path);
		const { body, headers, ...requestInit } = options;
		const requestHeaders = new Headers(headers);

		requestHeaders.set('accept', 'application/json');

		const serializedBody = body === undefined ? undefined : JSON.stringify(body);

		if (serializedBody !== undefined) {
			requestHeaders.set('content-type', 'application/json');
		}

		const response = await this.fetcher(url, {
			...requestInit,
			body: serializedBody,
			credentials: requestInit.credentials ?? 'same-origin',
			headers: requestHeaders
		});
		const responseBody = await this.readBody(response);

		if (!response.ok) {
			throw new ApiHttpError(response.status, responseBody, url);
		}

		return schema.parse(responseBody);
	}

	private createUrl(path: string): string {
		if (this.baseUrl.length === 0) {
			return path;
		}

		return new URL(path, this.baseUrl).toString();
	}

	private async readBody(response: Response): Promise<unknown> {
		const text = await response.text();

		if (text.length === 0) {
			return undefined;
		}

		try {
			return JSON.parse(text) as unknown;
		}
		catch {
			return text;
		}
	}
}
