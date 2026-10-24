import { z } from 'zod';

import { DEFAULT_MAX_COUNTER_KEYS } from './fixed-window-counter';

const passwordSignInEnvironmentSchema = z.object({
	PASSWORD_VERIFY_MAX_CONCURRENT: z.coerce.number().int().min(1).max(8).default(8),
	PASSWORD_VERIFY_MAX_QUEUE: z.coerce.number().int().min(0).max(64).default(64),
	PASSWORD_VERIFY_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1).max(10_000).default(2_000),
	LOGIN_RATE_LIMIT_MAX_KEYS: z.coerce.number().int().min(1).max(100_000).default(DEFAULT_MAX_COUNTER_KEYS)
});

export function getPasswordSignInConfig(environment: NodeJS.ProcessEnv = process.env) {
	const parsed = passwordSignInEnvironmentSchema.parse(environment);

	return {
		maxConcurrent: parsed.PASSWORD_VERIFY_MAX_CONCURRENT,
		maxCounterKeys: parsed.LOGIN_RATE_LIMIT_MAX_KEYS,
		maxQueue: parsed.PASSWORD_VERIFY_MAX_QUEUE,
		queueTimeoutMilliseconds: parsed.PASSWORD_VERIFY_QUEUE_TIMEOUT_MS
	};
}
