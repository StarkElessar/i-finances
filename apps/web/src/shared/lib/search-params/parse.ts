import type { z } from 'zod';

import type { RawSearchParams } from './types';

/**
 * Reads the first value from a raw query entry.
 */
export function readFirstSearchParamValue(
	value: string | string[] | undefined
): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses known schema keys from a raw query object into typed route search state.
 */
export function parseRouteSearchParams<TSchema extends z.ZodObject>(
	schema: TSchema,
	raw: RawSearchParams
): z.infer<TSchema> {
	const shape = schema.shape;
	const candidate: Record<string, string | undefined> = {};

	for (const key of Object.keys(shape)) {
		const value = readFirstSearchParamValue(raw[key])?.trim();
		candidate[key] = value && value.length > 0 ? value : undefined;
	}

	return schema.parse(candidate);
}
