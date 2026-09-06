import {
	ApiClient,
	type ApiClient as ApiClientType,
	type ApiClientOptions
} from '@/shared/api';

import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetCategoryOperationsInput,
	GetContactOperationsInput,
	GetMonthlyExpenseSummaryInput,
	OperationCommandResult,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from '@i-finances/contracts';
import {
	accountBalancesSchema,
	accountLedgerSchema,
	changeOperationDeletionStateInputSchema,
	createOperationInputSchema,
	categoryOperationsSchema,
	contactOperationsSchema,
	getAccountLedgerInputSchema,
	getCategoryOperationsInputSchema,
	getContactOperationsInputSchema,
	getMonthlyExpenseSummaryInputSchema,
	monthlyExpenseSummarySchema,
	operationCommandResultSchema,
	recalculateOperationRateInputSchema,
	updateOperationInputSchema
} from '@i-finances/contracts';

export type OperationClientOptions = ApiClientOptions & {
	client?: ApiClientType;
};

export class OperationClient {
	private readonly client: ApiClientType;

	public constructor(options: OperationClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public balances() {
		return this.client.get('/api/operations/balances', accountBalancesSchema);
	}

	public ledger(input: GetAccountLedgerInput) {
		const parsedInput = getAccountLedgerInputSchema.parse(input);
		const query = new URLSearchParams(parsedInput);

		return this.client.get(`/api/operations/ledger?${query.toString()}`, accountLedgerSchema);
	}

	public byCategory(input: GetCategoryOperationsInput) {
		const parsedInput = getCategoryOperationsInputSchema.parse(input);
		const query = new URLSearchParams(parsedInput);

		return this.client.get(
			`/api/operations/by-category?${query.toString()}`,
			categoryOperationsSchema
		);
	}

	public byContact(input: GetContactOperationsInput) {
		const parsedInput = getContactOperationsInputSchema.parse(input);
		const query = new URLSearchParams(parsedInput);

		return this.client.get(
			`/api/operations/by-contact?${query.toString()}`,
			contactOperationsSchema
		);
	}

	public monthlySummary(input: GetMonthlyExpenseSummaryInput) {
		const parsedInput = getMonthlyExpenseSummaryInputSchema.parse(input);
		const query = new URLSearchParams(parsedInput);

		return this.client.get(
			`/api/operations/monthly-summary?${query.toString()}`,
			monthlyExpenseSummarySchema
		);
	}

	public create(input: CreateOperationInput): Promise<OperationCommandResult> {
		return this.client.post(
			'/api/operations',
			createOperationInputSchema.parse(input),
			operationCommandResultSchema
		);
	}

	public update(input: UpdateOperationInput): Promise<OperationCommandResult> {
		const parsedInput = updateOperationInputSchema.parse(input);

		return this.client.put(
			`/api/operations/${encodeURIComponent(parsedInput.id)}`,
			parsedInput,
			operationCommandResultSchema
		);
	}

	public archive(input: ChangeOperationDeletionStateInput): Promise<OperationCommandResult> {
		return this.changeDeletionState('archive', input);
	}

	public restore(input: ChangeOperationDeletionStateInput): Promise<OperationCommandResult> {
		return this.changeDeletionState('restore', input);
	}

	public recalculateRate(input: RecalculateOperationRateInput): Promise<OperationCommandResult> {
		const parsedInput = recalculateOperationRateInputSchema.parse(input);

		return this.client.post(
			`/api/operations/${encodeURIComponent(parsedInput.id)}/recalculate-rate`,
			parsedInput,
			operationCommandResultSchema
		);
	}

	private changeDeletionState(
		action: 'archive' | 'restore',
		input: ChangeOperationDeletionStateInput
	): Promise<OperationCommandResult> {
		const parsedInput = changeOperationDeletionStateInputSchema.parse(input);

		return this.client.post(
			`/api/operations/${encodeURIComponent(parsedInput.id)}/${action}`,
			parsedInput,
			operationCommandResultSchema
		);
	}
}
