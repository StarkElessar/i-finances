import type { z } from 'zod';

import type { SerializedSearchParams } from './types';

/**
 * Serializes typed route search state into a flat query patch for the router.
 * Schema keys missing or blank become `undefined` so the router removes them.
 */
export function serializeRouteSearchParams<TSchema extends z.ZodObject>(
	schema: TSchema,
	state: z.infer<TSchema>
): SerializedSearchParams {
	const shape = schema.shape;
	const result: SerializedSearchParams = {};
	const record = state as Record<string, unknown>;

	for (const key of Object.keys(shape)) {
		const value = record[key];

		if (typeof value !== 'string') {
			result[key] = undefined;
			continue;
		}

		const trimmed = value.trim();
		result[key] = trimmed.length > 0 ? trimmed : undefined;
	}

	return result;
}
