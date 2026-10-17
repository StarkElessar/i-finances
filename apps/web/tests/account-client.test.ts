import { AccountClient } from '@/features/accounts/api';

import { describe, expect, it } from 'vitest';

const account = {
	archivedAt: null,
	color: '#3f77a8',
	createdAt: '2026-07-24T10:00:00.000Z',
	currency: 'BYN',
	description: '',
	details: { cardNumberLast4: null, expiry: null },
	hasOperations: false,
	id: 'account/main',
	initialBalanceMinor: 10_000,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name: 'Основной счёт',
	owner: '',
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
			owner: '',
			type: 'card'
		})).resolves.toEqual({ account, ok: true });
	});

	it('encodes account IDs in update requests', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/accounts/account%2Fmain');
			expect(init?.method).toBe('PUT');
			expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toMatchObject({
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
			details: { cardNumber: null, expiry: null }
		});
	});

	it('loads one account with full card details', async () => {
		const fullAccount = {
			...account,
			details: { cardNumber: '4111111111111111', cardNumberLast4: '1111', expiry: '08/27' },
			owner: 'Сергей'
		};
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/accounts/account%2Fmain');
			expect(init?.method).toBe('GET');

			return new Response(JSON.stringify(fullAccount), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new AccountClient({ fetcher });

		await expect(client.getFull('account/main')).resolves.toEqual(fullAccount);
	});
});
