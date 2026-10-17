import { type AuthConfig, getAuthConfig } from '@/modules/auth';

function readHeaderOrigin(value: string): string | undefined {
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
	const originHeader = request.headers.get('origin');

	// A present Origin header is authoritative. One that cannot be parsed (`null` from sandboxed frames, redirects
	// across origins, privacy modes) must not fall through to Referer, which an attacker page can often steer.
	if (originHeader !== null) {
		const origin = readHeaderOrigin(originHeader);

		return origin !== undefined && allowedOrigins.has(origin);
	}

	const refererHeader = request.headers.get('referer');
	const refererOrigin = refererHeader === null ? undefined : readHeaderOrigin(refererHeader);

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
