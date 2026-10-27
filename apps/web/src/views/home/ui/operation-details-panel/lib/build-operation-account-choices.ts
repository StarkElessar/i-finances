import type { PersistedAccount } from '@/entities/account';
import type { AccountBalance } from '@/entities/operation';

import type { OperationAccountChoice } from '../types';

/**
 * Joins the household accounts with their balances into the choices of the «Счёт» field. An account without a balance
 * row (no operations yet) shows zero.
 */
export function buildOperationAccountChoices(
	accounts: readonly PersistedAccount[],
	balances: readonly AccountBalance[]
): OperationAccountChoice[] {
	const balanceMinorById = new Map(balances.map((balance) => [balance.accountId, balance.balanceMinor]));

	return accounts.map((account) => ({
		archived: account.archivedAt !== null,
		balanceMinor: balanceMinorById.get(account.id) ?? 0,
		color: account.color,
		currency: account.currency,
		id: account.id,
		name: account.name,
		type: account.type
	}));
}
