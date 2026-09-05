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
});
