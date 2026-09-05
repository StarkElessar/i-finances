import {
	ApiClient,
	type ApiClient as ApiClientType,
	type ApiClientOptions
} from '@/shared/api';

import type {
	ChangeContactArchiveStateInput,
	ContactCommandResult,
	ContactListStatus,
	CreateContactInput,
	UpdateContactInput
} from '@i-finances/contracts';
import {
	changeContactArchiveStateInputSchema,
	contactCollectionSchema,
	contactCommandResultSchema,
	contactListInputSchema,
	createContactInputSchema,
	updateContactInputSchema
} from '@i-finances/contracts';

export type ContactClientOptions = ApiClientOptions & {
	client?: ApiClientType;
};

export class ContactClient {
	private readonly client: ApiClientType;

	public constructor(options: ContactClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public list(status: ContactListStatus = 'active') {
		const parsedInput = contactListInputSchema.parse({ status });
		const query = new URLSearchParams({ status: parsedInput.status });

		return this.client.get(
			`/api/contacts?${query.toString()}`,
			contactCollectionSchema
		);
	}

	public create(input: CreateContactInput): Promise<ContactCommandResult> {
		return this.client.post(
			'/api/contacts',
			createContactInputSchema.parse(input),
			contactCommandResultSchema
		);
	}

	public update(input: UpdateContactInput): Promise<ContactCommandResult> {
		const parsedInput = updateContactInputSchema.parse(input);

		return this.client.put(
			`/api/contacts/${encodeURIComponent(parsedInput.id)}`,
			parsedInput,
			contactCommandResultSchema
		);
	}

	public archive(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> {
		return this.changeArchiveState('archive', input);
	}

	public restore(input: ChangeContactArchiveStateInput): Promise<ContactCommandResult> {
		return this.changeArchiveState('restore', input);
	}

	private changeArchiveState(
		action: 'archive' | 'restore',
		input: ChangeContactArchiveStateInput
	): Promise<ContactCommandResult> {
		const parsedInput = changeContactArchiveStateInputSchema.parse(input);

		return this.client.post(
			`/api/contacts/${encodeURIComponent(parsedInput.id)}/${action}`,
			parsedInput,
			contactCommandResultSchema
		);
	}
}
