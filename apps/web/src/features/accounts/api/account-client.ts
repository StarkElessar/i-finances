import {
	accountCollectionSchema,
	type AccountCommandResult,
	accountCommandResultSchema,
	accountListInputSchema,
	type ChangeAccountArchiveStateInput,
	changeAccountArchiveStateInputSchema,
	type CreateAccountInput,
	createAccountInputSchema,
	type UpdateAccountInput,
	updateAccountInputSchema
} from '@i-finances/contracts';

import {
	ApiClient,
	type ApiClientOptions
} from '../../../shared/api';

export type AccountClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

export class AccountClient {
	private readonly client: ApiClient;

	public constructor(options: AccountClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public list(includeArchived = false) {
		const parsedInput = accountListInputSchema.parse({ includeArchived });
		const query = new URLSearchParams({
			includeArchived: String(parsedInput.includeArchived)
		});

		return this.client.get(
			`/api/accounts?${query.toString()}`,
			accountCollectionSchema
		);
	}

	public create(input: CreateAccountInput): Promise<AccountCommandResult> {
		return this.client.post(
			'/api/accounts',
			createAccountInputSchema.parse(input),
			accountCommandResultSchema
		);
	}

	public update(input: UpdateAccountInput): Promise<AccountCommandResult> {
		const parsedInput = updateAccountInputSchema.parse(input);

		return this.client.put(
			`/api/accounts/${encodeURIComponent(parsedInput.id)}`,
			parsedInput,
			accountCommandResultSchema
		);
	}

	public archive(input: ChangeAccountArchiveStateInput): Promise<AccountCommandResult> {
		return this.changeArchiveState('archive', input);
	}

	public restore(input: ChangeAccountArchiveStateInput): Promise<AccountCommandResult> {
		return this.changeArchiveState('restore', input);
	}

	private changeArchiveState(
		action: 'archive' | 'restore',
		input: ChangeAccountArchiveStateInput
	): Promise<AccountCommandResult> {
		const parsedInput = changeAccountArchiveStateInputSchema.parse(input);

		return this.client.post(
			`/api/accounts/${encodeURIComponent(parsedInput.id)}/${action}`,
			parsedInput,
			accountCommandResultSchema
		);
	}
}
