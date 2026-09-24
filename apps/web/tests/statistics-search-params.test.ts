import { parseRouteSearchParams } from '@/shared/lib/search-params';

import { statisticsSearchParamsSchema } from '@/views/statistics/model/statistics-search-params';

import { describe, expect, it } from 'vitest';

describe('statisticsSearchParamsSchema', () => {
	it('parses a full compare state', () => {
		expect(parseRouteSearchParams(statisticsSearchParamsSchema, {
			by: 'contact',
			from: '2026-01',
			ids: 'all',
			tab: 'compare',
			to: '2026-09'
		})).toEqual({ by: 'contact', from: '2026-01', ids: 'all', tab: 'compare', to: '2026-09' });
	});

	it('drops invalid values without throwing', () => {
		expect(parseRouteSearchParams(statisticsSearchParamsSchema, {
			by: 'account',
			from: '2026-13',
			tab: 'nope',
			to: 'soon'
		})).toEqual({ by: undefined, from: undefined, ids: undefined, tab: undefined, to: undefined });
	});
});
