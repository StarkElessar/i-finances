import type { AccountClient as AccountApiClient } from '@/features/accounts/api';

import type { PersistedAccount } from '@i-finances/contracts';
import { updateAccountInputSchema } from '@i-finances/contracts';

import type { AccountFormFields } from './account-form';

export function updateAccount(
	client: AccountApiClient,
	account: PersistedAccount,
	fields: AccountFormFields,
	confirmCurrencyCorrection: boolean
) {
	return client.update(updateAccountInputSchema.parse({
		...fields,
		confirmCurrencyCorrection,
		id: account.id,
		version: account.version
	}));
}
