import { z } from 'zod';

import { CATEGORY_ICON_IDS } from './category-icons';

export const currencyCodeSchema = z.enum(['BYN', 'EUR', 'USD']);

export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/**
 * Produces the canonical category name stored and returned by the API.
 */
export function normalizeCategoryName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

/**
 * Produces a locale-aware identity used for uniqueness and matching.
 */
export function normalizeCategoryIdentity(value: string): string {
	return normalizeCategoryName(value)
		.toLocaleLowerCase('ru-BY')
		.replace(/ё/g, 'е');
}

/**
 * Produces the canonical lowercase keyword displayed in category forms.
 */
export function normalizeCategoryKeyword(value: string): string {
	return normalizeCategoryName(value).toLocaleLowerCase('ru-BY');
}

export const CATEGORY_LIST_STATUSES = [
	'active',
	'archived',
	'all'
] as const;

const categoryIdSchema = z.string().trim().min(1).max(128);
const categoryVersionSchema = z.number().int().positive();
const categoryNameSchema = z.string()
	.transform(normalizeCategoryName)
	.pipe(z.string().min(1, 'Укажите название категории.').max(120));
const categoryDescriptionSchema = z.string()
	.trim()
	.max(2_000, 'Описание не должно превышать 2000 символов.');
const categoryKeywordSchema = z.string()
	.transform(normalizeCategoryKeyword)
	.pipe(z.string().min(1, 'Ключевое слово не может быть пустым.'));
const categoryKeywordsSchema = z.array(categoryKeywordSchema)
	.superRefine((keywords, context) => {
		const identities = new Set<string>();

		keywords.forEach((keyword, index) => {
			const identity = normalizeCategoryIdentity(keyword);

			if (identities.has(identity)) {
				context.addIssue({
					code: 'custom',
					message: 'Ключевые слова не должны повторяться.',
					path: [index]
				});
				return;
			}

			identities.add(identity);
		});
	});
const optionalBudgetSchema = z.number()
	.int()
	.positive('Бюджет должен быть больше нуля.')
	.max(Number.MAX_SAFE_INTEGER)
	.nullable();

const editableCategoryFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	description: categoryDescriptionSchema,
	icon: z.enum(CATEGORY_ICON_IDS),
	keywords: categoryKeywordsSchema,
	monthlyBudgetMinor: optionalBudgetSchema,
	name: categoryNameSchema
};

/**
 * Validates category list filtering.
 */
export const categoryListInputSchema = z.object({
	status: z.enum(CATEGORY_LIST_STATUSES).default('active')
});

/**
 * Validates creation of one household category.
 */
export const createCategoryInputSchema = z.object(editableCategoryFields);

/**
 * Validates a complete category update with an optimistic-lock version.
 */
export const updateCategoryInputSchema = z.object({
	...editableCategoryFields,
	id: categoryIdSchema,
	version: categoryVersionSchema
});

/**
 * Validates archive and restore commands.
 */
export const changeCategoryArchiveStateInputSchema = z.object({
	id: categoryIdSchema,
	version: categoryVersionSchema
});

export type CategoryListInput = z.infer<typeof categoryListInputSchema>;
export type CategoryListStatus = CategoryListInput['status'];
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
export type ChangeCategoryArchiveStateInput = z.infer<
	typeof changeCategoryArchiveStateInputSchema
>;

const categoryDateSchema = z.string().min(1);

export const persistedCategorySchema = z.object({
	archivedAt: categoryDateSchema.nullable(),
	color: z.string(),
	createdAt: categoryDateSchema,
	description: z.string(),
	icon: z.enum(CATEGORY_ICON_IDS),
	id: z.string().min(1),
	keywords: z.array(z.string()),
	monthlyBudgetMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
	name: z.string().min(1),
	updatedAt: categoryDateSchema,
	version: z.number().int().positive()
});

export type PersistedCategory = z.infer<typeof persistedCategorySchema>;

export type CategoryCollection = {
	baseCurrency: CurrencyCode;
	items: PersistedCategory[];
};

export const categoryCollectionSchema = z.object({
	baseCurrency: currencyCodeSchema,
	items: z.array(persistedCategorySchema)
});

export type CategoryCollectionResponse = z.infer<typeof categoryCollectionSchema>;

export type PublicCategory = Pick<
	PersistedCategory,
	'color' | 'description' | 'id' | 'keywords' | 'name'
>;

export const publicCategorySchema: z.ZodType<PublicCategory> = persistedCategorySchema.pick({
	color: true,
	description: true,
	id: true,
	keywords: true,
	name: true
});

export const publicCategoriesResponseSchema = z.array(publicCategorySchema);

export const categoryCommandErrorCodeSchema = z.enum([
	'conflict',
	'forbidden',
	'invalid-input',
	'not-found',
	'unauthenticated'
]);

export type CategoryCommandErrorCode = z.infer<typeof categoryCommandErrorCodeSchema>;

export const categoryCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		category: persistedCategorySchema,
		ok: z.literal(true)
	}),
	z.object({
		errorCode: categoryCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type CategoryCommandResult = z.infer<typeof categoryCommandResultSchema>;
