import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
	parseRouteSearchParams,
	serializeRouteSearchParams
} from '~/shared/lib/search-params';

const sampleSchema = z.object({
	account: z.string().trim().min(1).max(128).optional(),
	mode: z.enum(['week', 'month']).optional()
});

describe('route search params', () => {
	it('parses optional string keys from raw query values', () => {
		expect(parseRouteSearchParams(sampleSchema, {
			account: 'acc-1',
			mode: 'month'
		})).toEqual({
			account: 'acc-1',
			mode: 'month'
		});
	});

	it('uses the first value when a query key is an array', () => {
		expect(parseRouteSearchParams(sampleSchema, {
			account: ['acc-2', 'acc-3']
		})).toEqual({
			account: 'acc-2'
		});
	});

	it('treats empty query as empty typed state', () => {
		expect(parseRouteSearchParams(sampleSchema, {})).toEqual({});
	});

	it('serializes defined keys and clears missing optional keys', () => {
		expect(serializeRouteSearchParams(sampleSchema, {
			account: 'acc-1'
		})).toEqual({
			account: 'acc-1',
			mode: undefined
		});
	});

	it('clears blank optional strings on serialize', () => {
		expect(serializeRouteSearchParams(sampleSchema, {
			account: '   '
		})).toEqual({
			account: undefined,
			mode: undefined
		});
	});
});
