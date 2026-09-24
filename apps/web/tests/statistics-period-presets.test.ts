import { isPresetActive, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';

import { describe, expect, it } from 'vitest';

const CURRENT = '2026-09';
const EARLIEST = '2025-01';

describe('resolvePeriodPreset', () => {
	it('resolves the last N months including the current one', () => {
		expect(resolvePeriodPreset('3', CURRENT, EARLIEST)).toEqual({ from: '2026-07', to: '2026-09' });
		expect(resolvePeriodPreset('12', CURRENT, EARLIEST)).toEqual({ from: '2025-10', to: '2026-09' });
	});

	it('resolves year-to-date', () => {
		expect(resolvePeriodPreset('ytd', CURRENT, EARLIEST)).toEqual({ from: '2026-01', to: '2026-09' });
	});

	it('never starts before the earliest month with data', () => {
		expect(resolvePeriodPreset('12', CURRENT, '2026-01')).toEqual({ from: '2026-01', to: '2026-09' });
	});
});

describe('isPresetActive', () => {
	it('matches the preset that produced the range', () => {
		expect(isPresetActive('6', { from: '2026-04', to: '2026-09' }, CURRENT, EARLIEST)).toBe(true);
		expect(isPresetActive('3', { from: '2026-04', to: '2026-09' }, CURRENT, EARLIEST)).toBe(false);
		expect(isPresetActive('ytd', { from: '2026-01', to: '2026-09' }, CURRENT, EARLIEST)).toBe(true);
	});

	it('is inactive when the range does not end in the current month', () => {
		expect(isPresetActive('3', { from: '2026-06', to: '2026-08' }, CURRENT, EARLIEST)).toBe(false);
	});
});
