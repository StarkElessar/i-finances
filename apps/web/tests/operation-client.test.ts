import { OperationClient } from '@/features/operations/api';

import { describe, expect, it } from 'vitest';

describe('OperationClient', () => {
	it('serializes ledger filters and validates the response through contracts', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/operations/ledger?accountId=account%2Fmain&end=2026-08-08&start=2026-08-01');
			expect(init?.method).toBe('GET');

			return new Response(JSON.stringify({
				accountCurrency: 'BYN',
				accountId: 'account/main',
				closingBalanceMinor: 12_000,
				householdBaseCurrency: 'BYN',
				items: [],
				openingBalanceMinor: 10_000,
				range: { end: '2026-08-08', start: '2026-08-01' }
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.ledger({
			accountId: 'account/main',
			end: '2026-08-08',
			start: '2026-08-01'
		})).resolves.toMatchObject({
			accountId: 'account/main',
			closingBalanceMinor: 12_000
		});
	});

	it('loads account balances through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/balances');

			return new Response(JSON.stringify([{
				accountId: 'account/main',
				balanceMinor: 12_000,
				currency: 'BYN'
			}]), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.balances()).resolves.toEqual([{
			accountId: 'account/main',
			balanceMinor: 12_000,
			currency: 'BYN'
		}]);
	});

	it('loads category stats through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/category-stats?month=2026-09');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				items: [{
					averageMinor: 15_000,
					categoryId: 'category-food',
					currentMinor: 45_000,
					deltaPercent: 200,
					monthsIncludedCount: 2
				}],
				month: '2026-09'
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.categoryStats({ month: '2026-09' })).resolves.toMatchObject({
			month: '2026-09'
		});
	});

	it('loads the monthly trend through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/monthly-trend');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				points: [{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' }]
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.monthlyTrend()).resolves.toEqual({
			baseCurrency: 'BYN',
			points: [{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' }]
		});
	});

	it('loads the monthly breakdown through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/monthly-breakdown?by=contact&from=2026-01&to=2026-09');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				by: 'contact',
				cells: [{ month: '2026-08', referenceId: 'contact-evroopt', totalMinor: 20_360 }],
				from: '2026-01',
				to: '2026-09'
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.monthlyBreakdown({ by: 'contact', from: '2026-01', to: '2026-09' })).resolves.toEqual({
			baseCurrency: 'BYN',
			by: 'contact',
			cells: [{ month: '2026-08', referenceId: 'contact-evroopt', totalMinor: 20_360 }],
			from: '2026-01',
			to: '2026-09'
		});
	});
});
