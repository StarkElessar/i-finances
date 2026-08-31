import {
	parseRouteSearchParams,
	serializeRouteSearchParams
} from '~/shared/lib/search-params';

import { homeSearchParamsSchema } from '~/views/home/model/home-search-params';

import { describe, expect, it } from 'vitest';

describe('homeSearchParamsSchema', () => {
	it('parses a valid period mode and from date', () => {
		expect(parseRouteSearchParams(homeSearchParamsSchema, {
			from: '2026-08-01',
			period: 'week'
		})).toEqual({
			from: '2026-08-01',
			period: 'week'
		});
	});

	it('treats an invalid period as absent without throwing', () => {
		expect(parseRouteSearchParams(homeSearchParamsSchema, {
			period: 'nope'
		})).toEqual({
			period: undefined
		});
	});

	it('treats a malformed from as absent without throwing', () => {
		expect(parseRouteSearchParams(homeSearchParamsSchema, {
			from: '2026-8-1'
		})).toEqual({
			from: undefined
		});
	});

	it('serializes period and from and clears omitted keys', () => {
		expect(serializeRouteSearchParams(homeSearchParamsSchema, {
			account: 'acc-1',
			from: '2026-01-01',
			period: 'year'
		})).toEqual({
			account: 'acc-1',
			from: '2026-01-01',
			period: 'year'
		});

		expect(serializeRouteSearchParams(homeSearchParamsSchema, {
			account: 'acc-1'
		})).toEqual({
			account: 'acc-1',
			from: undefined,
			period: undefined
		});
	});
});
