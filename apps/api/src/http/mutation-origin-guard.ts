import type { AuthConfig } from '@/modules/auth';

import type { Context, MiddlewareHandler } from 'hono';

import { isSameOriginMutation } from './mutation-origin';
import type { ApiEnvironment } from './types';

/** Rejects foreign origins before body-limit middleware can read a streamed body. */
export function mutationOriginGuard(
	config: AuthConfig,
	onInvalidOrigin: (context: Context<ApiEnvironment>) => Response
): MiddlewareHandler<ApiEnvironment> {
	return async (context, next) => {
		if (!isSameOriginMutation(context.req.raw, config)) {
			return onInvalidOrigin(context);
		}

		return next();
	};
}
