import { z } from 'zod';

import {
    normalizeCategoryIdentity,
    normalizeCategoryKeyword,
    normalizeCategoryName
} from '~/entities/category/model/normalization';
import type { PersistedCategory } from '~/entities/category/model/types';

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

export type CategoryCommandErrorCode =
    | 'conflict'
    | 'forbidden'
    | 'invalid-input'
    | 'not-found'
    | 'unauthenticated';

export type CategoryCommandResult =
    | {
        category: PersistedCategory;
        ok: true;
    }
    | {
        errorCode: CategoryCommandErrorCode;
        fieldErrors?: Record<string, string>;
        message: string;
        ok: false;
    };
