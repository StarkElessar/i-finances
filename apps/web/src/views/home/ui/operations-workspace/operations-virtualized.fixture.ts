import type { Account } from '@/entities/account';
import type { OperationWithBalance } from '@/entities/operation';

export const VIRTUALIZED_ACCOUNT: Account = {
	color: 'var(--color-primary)',
	currency: 'BYN',
	description: '',
	details: {},
	id: 'virtualized-account',
	initialBalanceMinor: 0,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name: '5000 операций',
	owner: '',
	type: 'cash'
};

/** Deterministic year-sized data, shared by the performance stories and model tests. */
export function createVirtualizedOperations(count: number): OperationWithBalance[] {
	return Array.from({ length: count }, (_, index) => {
		const happenedOn = new Date(Date.UTC(2026, 0, 1 + Math.floor(index / 20))).toISOString().slice(0, 10);
		const createdAt = `${happenedOn}T12:00:00.000Z`;

		return {
			accountId: VIRTUALIZED_ACCOUNT.id,
			amountInHouseholdBaseCurrencyMinor: 100,
			amountMinor: 100,
			balanceAfterMinor: -(index + 1) * 100,
			categoryId: null,
			categoryName: null,
			comment: index % 2 === 0 ? 'Покупка для дома' : '',
			contactId: null,
			contactName: null,
			createdAt,
			currency: 'BYN',
			deletedAt: null,
			deletedByUserId: null,
			exchangeRate: { effectiveOn: happenedOn, fromCurrency: 'BYN', rate: '1', source: 'identity', toCurrency: 'BYN' },
			happenedOn,
			householdBaseCurrency: 'BYN',
			id: `operation-${index + 1}`,
			signedAmountMinor: -100,
			sourceOrder: -index,
			title: `Операция ${index + 1}`,
			transferId: null,
			type: 'expense',
			updatedAt: createdAt,
			version: 1
		};
	});
}
