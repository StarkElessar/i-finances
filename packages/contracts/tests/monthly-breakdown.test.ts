import { getMonthlyBreakdownInputSchema, monthlyBreakdownSchema } from '../src/operation';
import { describe, expect, it } from 'vitest';

describe('getMonthlyBreakdownInputSchema', () => {
	it('accepts a valid range for both dimensions', () => {
		expect(getMonthlyBreakdownInputSchema.parse({ by: 'category', from: '2026-01', to: '2026-09' }))
			.toEqual({ by: 'category', from: '2026-01', to: '2026-09' });
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'contact', from: '2026-09', to: '2026-09' }).success)
			.toBe(true);
	});

	it('rejects an unknown dimension and malformed months', () => {
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'account', from: '2026-01', to: '2026-02' }).success).toBe(false);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-13', to: '2026-12' }).success).toBe(false);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-1', to: '2026-12' }).success).toBe(false);
	});

	it('rejects from after to', () => {
		const result = getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-09', to: '2026-01' });

		expect(result.success).toBe(false);
	});

	it('accepts exactly 24 months and rejects 25', () => {
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2024-10', to: '2026-09' }).success).toBe(true);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2024-09', to: '2026-09' }).success).toBe(false);
	});
});

describe('monthlyBreakdownSchema', () => {
	it('parses a response with sparse cells', () => {
		const response = {
			baseCurrency: 'BYN',
			by: 'category',
			cells: [{ month: '2026-08', referenceId: 'category-food', totalMinor: 49_316 }],
			from: '2026-08',
			to: '2026-09'
		};

		expect(monthlyBreakdownSchema.parse(response)).toEqual(response);
	});
});
