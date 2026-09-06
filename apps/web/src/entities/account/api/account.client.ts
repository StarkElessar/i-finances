import { AccountClient } from '@/features/accounts/api';

import { resolveCommandResult } from '@/shared/api';

import type {
	ChangeAccountArchiveStateInput,
	CreateAccountInput,
	UpdateAccountInput
} from '@i-finances/contracts';
import { accountCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new AccountClient();

export const getAccounts = query(
	async (includeArchived = false) => (await client.list(includeArchived)).items,
	'accounts'
);

export const createAccount = action(
	(input: CreateAccountInput) => resolveCommandResult(
		() => client.create(input),
		accountCommandResultSchema
	),
	'create-account'
);

export const updateAccount = action(
	(input: UpdateAccountInput) => resolveCommandResult(
		() => client.update(input),
		accountCommandResultSchema
	),
	'update-account'
);

export const archiveAccount = action(
	(input: ChangeAccountArchiveStateInput) => resolveCommandResult(
		() => client.archive(input),
		accountCommandResultSchema
	),
	'archive-account'
);

export const restoreAccount = action(
	(input: ChangeAccountArchiveStateInput) => resolveCommandResult(
		() => client.restore(input),
		accountCommandResultSchema
	),
	'restore-account'
);
