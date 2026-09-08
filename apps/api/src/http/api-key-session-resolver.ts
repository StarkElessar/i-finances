import { createHash, timingSafeEqual } from 'node:crypto';

import type { PasswordUserRepository } from '@/modules/auth';
import type { AuthenticatedSession } from '@/modules/auth';

import type { RequestSessionResolver } from './session-resolver';

const SYNTHETIC_SESSION_LIFETIME_MILLISECONDS = 365 * 24 * 60 * 60 * 1000;

function hashSecret(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

/**
 * Resolves a session for trusted machine clients (MCP server, scripts) that
 * cannot hold a browser cookie. Authenticates a bearer token against
 * `MCP_API_KEY` and, on success, impersonates the configured `MCP_USER_ID`.
 *
 * Returns `null` — never throws — on any failure, matching
 * `RequestSessionResolver` so callers treat it exactly like an absent
 * cookie session.
 */
export class ApiKeySessionResolver implements RequestSessionResolver {
	public constructor(
		private readonly userRepository: PasswordUserRepository,
		private readonly apiKey: string | undefined = process.env.MCP_API_KEY,
		private readonly userId: string | undefined = process.env.MCP_USER_ID
	) {}

	public async resolve(request: Request): Promise<AuthenticatedSession | null> {
		if (this.apiKey === undefined || this.apiKey.length < 32 || this.userId === undefined || this.userId.length === 0) {
			return null;
		}

		const authorization = request.headers.get('authorization') ?? '';
		const spaceIndex = authorization.indexOf(' ');

		if (spaceIndex === -1) {
			return null;
		}

		const scheme = authorization.slice(0, spaceIndex);
		const providedKey = authorization.slice(spaceIndex + 1);

		if (scheme.toLowerCase() !== 'bearer' || providedKey.length === 0) {
			return null;
		}

		if (!timingSafeEqual(hashSecret(this.apiKey), hashSecret(providedKey))) {
			return null;
		}

		const user = await this.userRepository.findById(this.userId);

		if (user === undefined || !user.isActive) {
			return null;
		}

		return {
			expiresAt: new Date(Date.now() + SYNTHETIC_SESSION_LIFETIME_MILLISECONDS),
			id: 'mcp-service',
			user: {
				displayName: user.displayName,
				id: user.id,
				username: user.username
			}
		};
	}
}
