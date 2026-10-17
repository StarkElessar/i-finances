import { toAccountSummary } from '@/account-summary';

import type { PersistedAccount } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

describe('toAccountSummary', () => {
	it('exposes owner and never card details', () => {
		const account = {
			archivedAt: null,
			color: '#3f77a8',
			createdAt: '2026-10-17T00:00:00.000Z',
			currency: 'BYN',
			description: '',
			details: { cardNumberLast4: '1111', expiry: '08/27' },
			hasOperations: false,
			id: 'a1',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Основная карта',
			owner: 'Сергей',
			type: 'card',
			updatedAt: '2026-10-17T00:00:00.000Z',
			version: 1
		} satisfies PersistedAccount;

		expect(toAccountSummary(account)).toEqual({
			currency: 'BYN',
			id: 'a1',
			name: 'Основная карта',
			owner: 'Сергей',
			type: 'card'
		});
	});
});
