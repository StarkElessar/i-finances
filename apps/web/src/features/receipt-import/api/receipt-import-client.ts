import {
	ApiClient,
	type ApiClient as ApiClientType,
	type ApiClientOptions
} from '@/shared/api';

import {
	type ApproveReceiptInput,
	approveReceiptInputSchema,
	createdReceiptImportResponseSchema,
	receiptImportCollectionSchema,
	type ReceiptImportCommandResult,
	receiptImportCommandResultSchema,
	type RequestReceiptRevisionInput,
	requestReceiptRevisionInputSchema,
	type UpdateReceiptReviewInput,
	updateReceiptReviewInputSchema
} from '@i-finances/contracts';

export type ReceiptImportClientOptions = ApiClientOptions & {
	client?: ApiClientType;
};

export class ReceiptImportClient {
	private readonly client: ApiClientType;

	public constructor(options: ReceiptImportClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public list() {
		return this.client.get('/api/receipt-imports', receiptImportCollectionSchema);
	}

	public create(image: File) {
		const formData = new FormData();

		formData.set('image', image);

		return this.client.postForm(
			'/api/receipt-imports',
			formData,
			createdReceiptImportResponseSchema
		);
	}

	public requestRevision(input: RequestReceiptRevisionInput): Promise<ReceiptImportCommandResult> {
		const parsedInput = requestReceiptRevisionInputSchema.parse(input);

		return this.client.post(
			`/api/receipt-imports/${encodeURIComponent(parsedInput.id)}/revision`,
			parsedInput,
			receiptImportCommandResultSchema
		);
	}

	public approve(input: ApproveReceiptInput): Promise<ReceiptImportCommandResult> {
		const parsedInput = approveReceiptInputSchema.parse(input);

		return this.client.post(
			`/api/receipt-imports/${encodeURIComponent(parsedInput.id)}/approve`,
			parsedInput,
			receiptImportCommandResultSchema
		);
	}

	public updateReview(input: UpdateReceiptReviewInput): Promise<ReceiptImportCommandResult> {
		const parsedInput = updateReceiptReviewInputSchema.parse(input);

		return this.client.put(
			`/api/receipt-imports/${encodeURIComponent(parsedInput.id)}/review`,
			parsedInput,
			receiptImportCommandResultSchema
		);
	}
}
