import { action, query, revalidate } from '@solidjs/router';
import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type {
	CategoryCommandResult,
	CategoryListInput,
	ChangeCategoryArchiveStateInput,
	CreateCategoryInput,
	UpdateCategoryInput
} from './category.contract';
import {
	categoryListInputSchema,
	changeCategoryArchiveStateInputSchema,
	createCategoryInputSchema,
	updateCategoryInputSchema
} from './category.contract';

import type {
	CategoryCollection,
	PersistedCategory
} from '~/entities/category/model/types';
import {
	assertSameOriginMutation,
	InvalidMutationOriginError
} from '~/server/auth/csrf/origin-guard';
import {
	AuthenticationRequiredError,
	requireUser
} from '~/server/auth/require-user';
import {
	CategoryNameConflictError,
	CategoryNotFoundError,
	CategoryVersionConflictError
} from '~/server/category/category-errors';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createCategoryService } from '~/server/category/category-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import {
	createHouseholdResolver,
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '~/server/household/household-service';

const categoryService = createCategoryService({
	categoryRepository: createCategoryRepository(),
	householdResolver: createHouseholdResolver(createHouseholdRepository())
});

/**
 * Loads categories available to the current household.
 */
async function readCategories(
	input: CategoryListInput
): Promise<CategoryCollection> {
	'use server';

	const parsedInput = categoryListInputSchema.parse(input);
	const session = await requireUser();

	return categoryService.list(session.user.id, parsedInput.status);
}

export const getCategories = query(readCategories, 'categories');

/**
 * Converts Zod errors to the flat field shape consumed by forms.
 */
function createFieldErrors(error: z.ZodError): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	error.issues.forEach((issue) => {
		const field = issue.path[0];

		if (typeof field === 'string') {
			fieldErrors[field] = issue.message;
		}
	});

	return fieldErrors;
}

/**
 * Maps known domain and request failures to a stable action result.
 */
function createCategoryFailure(
	error: unknown
): CategoryCommandResult | undefined {
	if (error instanceof AuthenticationRequiredError) {
		return {
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		};
	}

	if (
		error instanceof InvalidMutationOriginError
		|| error instanceof HouseholdAccessRequiredError
	) {
		return {
			errorCode: 'forbidden',
			message: 'Недостаточно прав для изменения категорий.',
			ok: false
		};
	}

	if (error instanceof CategoryNameConflictError) {
		return {
			errorCode: 'conflict',
			fieldErrors: {
				name: 'Категория с таким названием уже существует.'
			},
			message: 'Используйте другое название категории.',
			ok: false
		};
	}

	if (
		error instanceof CategoryVersionConflictError
		|| error instanceof HouseholdSelectionRequiredError
	) {
		return {
			errorCode: 'conflict',
			message: 'Данные изменились. Обновите категории и повторите действие.',
			ok: false
		};
	}

	if (error instanceof CategoryNotFoundError) {
		return {
			errorCode: 'not-found',
			message: 'Категория не найдена.',
			ok: false
		};
	}

	return undefined;
}

/**
 * Executes one validated category command in the authenticated request context.
 */
async function executeCategoryCommand<TInput>(
	schema: z.ZodType<TInput>,
	input: TInput,
	command: (userId: string, value: TInput) => Promise<PersistedCategory>
): Promise<CategoryCommandResult> {
	const parsedInput = schema.safeParse(input);

	if (parsedInput.success) {
		try {
			assertSameOriginMutation(getWebRequest());

			const session = await requireUser();
			const category = await command(session.user.id, parsedInput.data);

			await revalidate(getCategories.key);

			return {
				category,
				ok: true
			};
		}
		catch (error: unknown) {
			const failure = createCategoryFailure(error);

			if (failure !== undefined) {
				return failure;
			}

			throw error;
		}
	}

	return {
		errorCode: 'invalid-input',
		fieldErrors: createFieldErrors(parsedInput.error),
		message: 'Проверьте поля категории.',
		ok: false
	};
}

async function createCategoryCommand(
	input: CreateCategoryInput
): Promise<CategoryCommandResult> {
	'use server';

	return executeCategoryCommand(
		createCategoryInputSchema,
		input,
		categoryService.create
	);
}

async function updateCategoryCommand(
	input: UpdateCategoryInput
): Promise<CategoryCommandResult> {
	'use server';

	return executeCategoryCommand(
		updateCategoryInputSchema,
		input,
		categoryService.update
	);
}

async function archiveCategoryCommand(
	input: ChangeCategoryArchiveStateInput
): Promise<CategoryCommandResult> {
	'use server';

	return executeCategoryCommand(
		changeCategoryArchiveStateInputSchema,
		input,
		categoryService.archive
	);
}

async function restoreCategoryCommand(
	input: ChangeCategoryArchiveStateInput
): Promise<CategoryCommandResult> {
	'use server';

	return executeCategoryCommand(
		changeCategoryArchiveStateInputSchema,
		input,
		categoryService.restore
	);
}

export const createCategory = action(createCategoryCommand, 'create-category');
export const updateCategory = action(updateCategoryCommand, 'update-category');
export const archiveCategory = action(archiveCategoryCommand, 'archive-category');
export const restoreCategory = action(restoreCategoryCommand, 'restore-category');
