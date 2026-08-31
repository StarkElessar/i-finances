import {
	parseRouteSearchParams,
	type RawSearchParams,
	serializeRouteSearchParams
} from '~/shared/lib/search-params';

import { useSearchParams } from '@solidjs/router';
import { createMemo } from 'solid-js';
import type { z } from 'zod';

/**
 * History mode for typed route search updates.
 */
export type RouteSearchHistoryMode = 'push' | 'replace';

/**
 * Options for patching typed route search params.
 */
export type SetRouteSearchParamsOptions = {
	history?: RouteSearchHistoryMode;
};

/**
 * Creates a typed, schema-backed binding to the current route search string.
 * Portable to any Solid app that uses `@solidjs/router` (no SolidStart APIs).
 */
export function createRouteSearchParams<TSchema extends z.ZodObject>(schema: TSchema) {
	type SearchState = z.infer<TSchema>;
	const [searchParams, setSearchParams] = useSearchParams();

	const params = createMemo(() => (
		parseRouteSearchParams(schema, searchParams as RawSearchParams)
	));

	/**
	 * Merges a typed patch into the current search state and navigates.
	 */
	const setParams = (
		patch: Partial<SearchState>,
		options?: SetRouteSearchParamsOptions
	) => {
		const next = {
			...params(),
			...patch
		} as SearchState;

		setSearchParams(serializeRouteSearchParams(schema, next), {
			replace: options?.history === 'replace'
		});
	};

	return {
		params,
		setParams
	};
}
