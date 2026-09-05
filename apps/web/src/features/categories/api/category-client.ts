import {
	ApiClient,
	type ApiClientOptions
} from '@/shared/api';

import {
	categoryCollectionSchema,
	type CategoryCommandResult,
	categoryCommandResultSchema,
	categoryListInputSchema,
	type CategoryListStatus,
	type ChangeCategoryArchiveStateInput,
	changeCategoryArchiveStateInputSchema,
	type CreateCategoryInput,
	createCategoryInputSchema,
	publicCategoriesResponseSchema,
	type UpdateCategoryInput,
	updateCategoryInputSchema
} from '@i-finances/contracts';

export type CategoryClientOptions = ApiClientOptions & {
	client?: ApiClient;
};

export class CategoryClient {
	private readonly client: ApiClient;

	public constructor(options: CategoryClientOptions = {}) {
		this.client = options.client ?? new ApiClient(options);
	}

	public list(status: CategoryListStatus = 'active') {
		const parsedInput = categoryListInputSchema.parse({ status });
		const query = new URLSearchParams({ status: parsedInput.status });

		return this.client.get(
			`/api/categories?${query.toString()}`,
			categoryCollectionSchema
		);
	}

	public listPublic() {
		return this.client.get(
			'/api/public/categories',
			publicCategoriesResponseSchema
		);
	}

	public create(input: CreateCategoryInput): Promise<CategoryCommandResult> {
		return this.client.post(
			'/api/categories',
			createCategoryInputSchema.parse(input),
			categoryCommandResultSchema
		);
	}

	public update(input: UpdateCategoryInput): Promise<CategoryCommandResult> {
		const parsedInput = updateCategoryInputSchema.parse(input);

		return this.client.put(
			`/api/categories/${encodeURIComponent(parsedInput.id)}`,
			parsedInput,
			categoryCommandResultSchema
		);
	}

	public archive(input: ChangeCategoryArchiveStateInput): Promise<CategoryCommandResult> {
		return this.changeArchiveState('archive', input);
	}

	public restore(input: ChangeCategoryArchiveStateInput): Promise<CategoryCommandResult> {
		return this.changeArchiveState('restore', input);
	}

	private changeArchiveState(
		action: 'archive' | 'restore',
		input: ChangeCategoryArchiveStateInput
	): Promise<CategoryCommandResult> {
		const parsedInput = changeCategoryArchiveStateInputSchema.parse(input);

		return this.client.post(
			`/api/categories/${encodeURIComponent(parsedInput.id)}/${action}`,
			parsedInput,
			categoryCommandResultSchema
		);
	}
}
