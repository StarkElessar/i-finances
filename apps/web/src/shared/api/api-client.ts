import { readApiAccessFailure } from './api-access-failure';
import { ApiHttpError } from './api-http-error';
import { markApiRequestStart, reportApiAccessFailure } from './session-rotation-gate';

/** `Retry-After` in whole seconds; the HTTP-date form is not used by this API. */
function readRetryAfterSeconds(headers: Headers): number | undefined {
	const value = headers.get('retry-after');

	if (value === null || !/^\d+$/.test(value.trim())) {
		return undefined;
	}

	return Number(value.trim());
}

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
		schema: ApiResponseSchema<TResponse>,
		/** `signal`, for example `AbortSignal.timeout(...)`, for a request that must not hang forever. */
		init?: Pick<RequestInit, 'signal'>
	): Promise<TResponse> {
		return this.request(path, schema, {
			body,
			method: 'POST',
			signal: init?.signal
		});
	}

	public async postForm<TResponse>(
		path: string,
		body: FormData,
		schema: ApiResponseSchema<TResponse>
	): Promise<TResponse> {
		return this.request(path, schema, {
			body,
			method: 'POST'
		});
	}

	public async delete<TResponse>(
		path: string,
		schema: ApiResponseSchema<TResponse>
	): Promise<TResponse> {
		return this.request(path, schema, { method: 'DELETE' });
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

		const serializedBody = body instanceof FormData
			? body
			: body === undefined
				? undefined
				: JSON.stringify(body);

		if (serializedBody !== undefined && !(body instanceof FormData)) {
			requestHeaders.set('content-type', 'application/json');
		}

		const startedAt = markApiRequestStart();
		const response = await this.fetcher(url, {
			...requestInit,
			body: serializedBody,
			credentials: requestInit.credentials ?? 'same-origin',
			headers: requestHeaders
		});
		const responseBody = await this.readBody(response);

		if (!response.ok) {
			const accessFailure = readApiAccessFailure(response.status, responseBody);

			// Before the throw: the session layer leaves the page first, so the page never renders this failure.
			if (accessFailure !== null) {
				reportApiAccessFailure(accessFailure, startedAt);
			}

			throw new ApiHttpError(response.status, responseBody, url, readRetryAfterSeconds(response.headers));
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
