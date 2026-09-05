import { type AuthConfig, getAuthConfig } from '@/modules/auth';

function readHeaderOrigin(value: string | null): string | undefined {
	if (value === null || value.length === 0) {
		return undefined;
	}

	try {
		return new URL(value).origin;
	}
	catch {
		return undefined;
	}
}

/**
 * Checks browser mutation headers against the current app origin.
 */
export function isSameOriginMutation(
	request: Request,
	config: AuthConfig = getAuthConfig()
): boolean {
	const allowedOrigins = new Set([
		new URL(request.url).origin,
		new URL(config.origin).origin
	]);
	const origin = readHeaderOrigin(request.headers.get('origin'));

	if (origin !== undefined) {
		return allowedOrigins.has(origin);
	}

	const refererOrigin = readHeaderOrigin(request.headers.get('referer'));

	return refererOrigin !== undefined && allowedOrigins.has(refererOrigin);
}

export class InvalidMutationOriginError extends Error {
	public readonly statusCode = 403;

	public constructor() {
		super('Invalid mutation origin.');
		this.name = 'InvalidMutationOriginError';
	}
}

export function assertSameOriginMutation(
	request: Request,
	config?: AuthConfig
): void {
	if (!isSameOriginMutation(request, config)) {
		throw new InvalidMutationOriginError();
	}
}
