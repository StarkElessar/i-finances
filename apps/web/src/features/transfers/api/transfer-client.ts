import {
	ApiClient,
	type ApiClient as ApiClientType,
	type ApiClientOptions
} from '@/shared/api';

import type {
	ChangeTransferDeletionStateInput,
	CreateTransferInput,
	GetTransferInput,
	TransferCommandResult,
	UpdateTransferInput
} from '@i-finances/contracts';
import {
	changeTransferDeletionStateInputSchema,
	createTransferInputSchema,
	getTransferInputSchema,
	transferCommandResultSchema,
	updateTransferInputSchema
} from '@i-finances/contracts';

export type TransferClientOptions = ApiClientOptions & {
	client?: ApiClientType;
};

export class TransferClient {
	private readonly client: ApiClientType;

	public constructor(options: TransferClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public get(input: GetTransferInput): Promise<TransferCommandResult> {
		const parsedInput = getTransferInputSchema.parse(input);

		return this.client.get(
			`/api/transfers/${encodeURIComponent(parsedInput.id)}`,
			transferCommandResultSchema
		);
	}

	public create(input: CreateTransferInput): Promise<TransferCommandResult> {
		return this.client.post(
			'/api/transfers',
			createTransferInputSchema.parse(input),
			transferCommandResultSchema
		);
	}

	public update(input: UpdateTransferInput): Promise<TransferCommandResult> {
		const parsedInput = updateTransferInputSchema.parse(input);

		return this.client.put(
			`/api/transfers/${encodeURIComponent(parsedInput.id)}`,
			parsedInput,
			transferCommandResultSchema
		);
	}

	public delete(input: ChangeTransferDeletionStateInput): Promise<TransferCommandResult> {
		const parsedInput = changeTransferDeletionStateInputSchema.parse(input);

		return this.client.post(
			`/api/transfers/${encodeURIComponent(parsedInput.id)}/delete`,
			parsedInput,
			transferCommandResultSchema
		);
	}
}
