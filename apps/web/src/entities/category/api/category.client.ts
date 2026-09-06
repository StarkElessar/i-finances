import { CategoryClient } from '@/features/categories/api';

import { resolveCommandResult } from '@/shared/api';

import type {
	CategoryListInput,
	ChangeCategoryArchiveStateInput,
	CreateCategoryInput,
	UpdateCategoryInput
} from '@i-finances/contracts';
import { categoryCommandResultSchema } from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new CategoryClient();

export const getCategories = query(
	(input: CategoryListInput) => client.list(input.status),
	'categories'
);

export const createCategory = action(
	(input: CreateCategoryInput) => resolveCommandResult(
		() => client.create(input),
		categoryCommandResultSchema
	),
	'create-category'
);

export const updateCategory = action(
	(input: UpdateCategoryInput) => resolveCommandResult(
		() => client.update(input),
		categoryCommandResultSchema
	),
	'update-category'
);

export const archiveCategory = action(
	(input: ChangeCategoryArchiveStateInput) => resolveCommandResult(
		() => client.archive(input),
		categoryCommandResultSchema
	),
	'archive-category'
);

export const restoreCategory = action(
	(input: ChangeCategoryArchiveStateInput) => resolveCommandResult(
		() => client.restore(input),
		categoryCommandResultSchema
	),
	'restore-category'
);
