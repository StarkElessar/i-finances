import { getAuthConfig } from '~/server/auth/auth-config';

/**
 * Signals that a mutation came from an unexpected origin.
 */
export class InvalidMutationOriginError extends Error {
	readonly statusCode = 403;

	/**
	 * Creates a consistent CSRF/origin failure.
	 */
	constructor() {
		super('Invalid mutation origin.');
		this.name = 'InvalidMutationOriginError';
	}
}

/**
 * Extracts an origin from an absolute URL header.
 */
function readHeaderOrigin(value: string | null): string | undefined {
	if (!value) {
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
 * Returns origins that are valid for this runtime request.
 */
function createAllowedOrigins(request: Request): Set<string> {
	return new Set([
		new URL(request.url).origin,
		new URL(getAuthConfig().origin).origin
	]);
}

/**
 * Checks browser mutation headers against the current app origin.
 */
export function isSameOriginMutation(request: Request): boolean {
	const allowedOrigins = createAllowedOrigins(request);
	const origin = readHeaderOrigin(request.headers.get('origin'));

	if (origin) {
		return allowedOrigins.has(origin);
	}

	const refererOrigin = readHeaderOrigin(request.headers.get('referer'));

	if (refererOrigin) {
		return allowedOrigins.has(refererOrigin);
	}

	return false;
}

/**
 * Throws when a mutation request does not come from the app origin.
 */
export function assertSameOriginMutation(request: Request): void {
	if (!isSameOriginMutation(request)) {
		throw new InvalidMutationOriginError();
	}
}
