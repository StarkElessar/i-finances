import { listTransferTargetAccounts } from '@/entities/transfer/model/target-accounts';

import { describe, expect, it } from 'vitest';

const accounts = [
	{ currency: 'BYN', id: 'byn-1' },
	{ currency: 'BYN', id: 'byn-2' },
	{ currency: 'USD', id: 'usd-1' }
];

describe('listTransferTargetAccounts', () => {
	it('keeps accounts of the same currency and drops only the source account', () => {
		expect(listTransferTargetAccounts(accounts, 'byn-1').map((account) => account.id))
			.toEqual(['byn-2', 'usd-1']);
	});

	it('returns every account while no source account is chosen', () => {
		expect(listTransferTargetAccounts(accounts, undefined)).toEqual(accounts);
	});
});
