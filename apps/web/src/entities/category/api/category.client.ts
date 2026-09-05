import { CategoryClient } from '@/features/categories/api';

import type {
	ChangeCategoryArchiveStateInput,
	CategoryListInput,
	CreateCategoryInput,
	UpdateCategoryInput
} from '@i-finances/contracts';
import { action, query } from '@solidjs/router';

const client = new CategoryClient();

export const getCategories = query(
	(input: CategoryListInput) => client.list(input.status),
	'categories'
);

export const createCategory = action(
	(input: CreateCategoryInput) => client.create(input),
	'create-category'
);

export const updateCategory = action(
	(input: UpdateCategoryInput) => client.update(input),
	'update-category'
);

export const archiveCategory = action(
	(input: ChangeCategoryArchiveStateInput) => client.archive(input),
	'archive-category'
);

export const restoreCategory = action(
	(input: ChangeCategoryArchiveStateInput) => client.restore(input),
	'restore-category'
);
