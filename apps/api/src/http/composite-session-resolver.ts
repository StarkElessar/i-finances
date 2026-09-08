import type { AuthenticatedSession } from '@/modules/auth';

import type { RequestSessionResolver } from './session-resolver';

/**
 * Tries each resolver in order and returns the first non-null session.
 * Lets a single request accept either a browser cookie session or a
 * machine bearer-token session without controllers knowing the difference.
 */
export class CompositeSessionResolver implements RequestSessionResolver {
	public constructor(private readonly resolvers: RequestSessionResolver[]) {}

	public async resolve(request: Request): Promise<AuthenticatedSession | null> {
		for (const resolver of this.resolvers) {
			const session = await resolver.resolve(request);

			if (session !== null) {
				return session;
			}
		}

		return null;
	}
}
