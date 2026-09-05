import { AccountClient } from '@/features/accounts/api';

import type {
	ChangeAccountArchiveStateInput,
	CreateAccountInput,
	UpdateAccountInput
} from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new AccountClient();

export const getAccounts = query(
	async (includeArchived = false) => (await client.list(includeArchived)).items,
	'accounts'
);

export const createAccount = action(
	(input: CreateAccountInput) => client.create(input),
	'create-account'
);

export const updateAccount = action(
	(input: UpdateAccountInput) => client.update(input),
	'update-account'
);

export const archiveAccount = action(
	(input: ChangeAccountArchiveStateInput) => client.archive(input),
	'archive-account'
);

export const restoreAccount = action(
	(input: ChangeAccountArchiveStateInput) => client.restore(input),
	'restore-account'
);
