import {
	formatLocalDateKey,
	parseLocalDateKey,
	resolveOperationPeriodSearchState,
	tryParseLocalDateKey
} from '~/entities/operation';

import { describe, expect, it } from 'vitest';

describe('local operation date parsing', () => {
	it('parses a valid local date at noon', () => {
		const date = tryParseLocalDateKey('2026-07-23');

		expect(date).toEqual(new Date(2026, 6, 23, 12));
	});

	it('does not throw for an empty date field value', () => {
		expect(tryParseLocalDateKey('')).toBeUndefined();
	});

	it('rejects a date that does not exist in the calendar', () => {
		expect(tryParseLocalDateKey('2026-02-31')).toBeUndefined();
		expect(() => parseLocalDateKey('2026-02-31'))
			.toThrow('Invalid local date key: 2026-02-31');
	});
});

describe('resolveOperationPeriodSearchState', () => {
	const now = new Date(2026, 7, 29, 12);

	it('snaps a mid-month from to the month start', () => {
		expect(resolveOperationPeriodSearchState({
			from: '2026-08-15',
			now,
			period: 'month'
		})).toMatchObject({
			from: '2026-08-01',
			period: 'month'
		});
	});

	it('defaults missing period and from to the current month', () => {
		expect(resolveOperationPeriodSearchState({ now })).toMatchObject({
			from: '2026-08-01',
			period: 'month'
		});
	});

	it('falls back to the current period when from is invalid', () => {
		expect(resolveOperationPeriodSearchState({
			from: '2026-02-31',
			now,
			period: 'year'
		})).toMatchObject({
			from: '2026-01-01',
			period: 'year'
		});
	});

	it('clamps a future period start to the current period', () => {
		expect(resolveOperationPeriodSearchState({
			from: '2027-01-01',
			now,
			period: 'year'
		})).toMatchObject({
			from: '2026-01-01',
			period: 'year'
		});
	});

	it('snaps week mode to Monday', () => {
		const resolved = resolveOperationPeriodSearchState({
			from: '2026-08-29',
			now,
			period: 'week'
		});

		expect(resolved).toMatchObject({
			from: '2026-08-24',
			period: 'week'
		});
		expect(formatLocalDateKey(resolved.anchor)).toBe('2026-08-24');
	});

	it('re-snaps the same from when switching to year mode', () => {
		expect(resolveOperationPeriodSearchState({
			from: '2025-08-01',
			now,
			period: 'year'
		})).toMatchObject({
			from: '2025-01-01',
			period: 'year'
		});
	});
});
