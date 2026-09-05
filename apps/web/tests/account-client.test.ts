import { AccountClient } from '@/features/accounts/api';

import { describe, expect, it } from 'vitest';

const account = {
	archivedAt: null,
	color: '#3f77a8',
	createdAt: '2026-07-24T10:00:00.000Z',
	currency: 'BYN',
	description: '',
	id: 'account/main',
	initialBalanceMinor: 10_000,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name: 'Основной счёт',
	type: 'card',
	updatedAt: '2026-07-24T10:00:00.000Z',
	version: 1
} as const;

describe('AccountClient', () => {
	it('serializes account commands through the contracts-backed HTTP boundary', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/accounts');
			expect(init?.method).toBe('POST');
			const body = typeof init?.body === 'string' ? init.body : '';

			expect(JSON.parse(body)).toMatchObject({
				currency: 'BYN',
				initialBalanceMinor: 10_000,
				name: 'Основной счёт'
			});

			return new Response(JSON.stringify({ account, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new AccountClient({ fetcher });

		await expect(client.create({
			color: '#3f77a8',
			currency: 'BYN',
			description: '',
			initialBalanceMinor: 10_000,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: ' Основной счёт ',
			type: 'card'
		})).resolves.toEqual({ account, ok: true });
	});

	it('encodes account IDs and preserves explicit correction confirmation', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/accounts/account%2Fmain');
			expect(init?.method).toBe('PUT');
			expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toMatchObject({
				confirmCurrencyCorrection: true,
				id: 'account/main',
				version: 1
			});

			return new Response(JSON.stringify({ account, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new AccountClient({ fetcher });

		await client.update({
			...account,
			confirmCurrencyCorrection: true
		});
	});
});
