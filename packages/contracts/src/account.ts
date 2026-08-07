import { z } from 'zod';

import { currencyCodeSchema } from './category';

export const accountTypeSchema = z.enum(['card', 'cash', 'other', 'savings']);

export type AccountType = z.infer<typeof accountTypeSchema>;

const accountIdSchema = z.string().trim().min(1).max(128);
const accountVersionSchema = z.number().int().positive();
const safeIntegerSchema = z.number()
	.int()
	.min(Number.MIN_SAFE_INTEGER)
	.max(Number.MAX_SAFE_INTEGER);
const accountNameSchema = z.string()
	.transform((value) => value.trim())
	.pipe(z.string().min(1, 'Укажите название счёта.').max(120));
const accountDescriptionSchema = z.string()
	.trim()
	.max(160, 'Описание не должно превышать 160 символов.');

const editableAccountFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	currency: currencyCodeSchema,
	description: accountDescriptionSchema,
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: accountNameSchema,
	type: accountTypeSchema
};

export const accountListInputSchema = z.object({
	includeArchived: z.preprocess(
		(value) => value === 'true' || value === true,
		z.boolean().default(false)
	)
});

export type AccountListInput = z.infer<typeof accountListInputSchema>;

export const createAccountInputSchema = z.object(editableAccountFields);

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.object({
	...editableAccountFields,
	confirmCurrencyCorrection: z.boolean().default(false),
	id: accountIdSchema,
	version: accountVersionSchema
});

export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

export const changeAccountArchiveStateInputSchema = z.object({
	id: accountIdSchema,
	version: accountVersionSchema
});

export type ChangeAccountArchiveStateInput = z.infer<
	typeof changeAccountArchiveStateInputSchema
>;

const accountDateSchema = z.string().min(1);

export const persistedAccountSchema = z.object({
	archivedAt: accountDateSchema.nullable(),
	color: z.string(),
	createdAt: accountDateSchema,
	currency: currencyCodeSchema,
	description: z.string(),
	id: z.string().min(1),
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: z.string().min(1),
	type: accountTypeSchema,
	updatedAt: accountDateSchema,
	version: accountVersionSchema
});

export type PersistedAccount = z.infer<typeof persistedAccountSchema>;

export const accountCollectionSchema = z.object({
	baseCurrency: currencyCodeSchema,
	items: z.array(persistedAccountSchema)
});

export type AccountCollection = z.infer<typeof accountCollectionSchema>;

export const accountCommandErrorCodeSchema = z.enum([
	'conflict',
	'confirmation-required',
	'forbidden',
	'invalid-input',
	'not-found',
	'rate-unavailable',
	'unauthenticated'
]);

export type AccountCommandErrorCode = z.infer<typeof accountCommandErrorCodeSchema>;

export const accountCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		account: persistedAccountSchema,
		ok: z.literal(true)
	}),
	z.object({
		errorCode: accountCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type AccountCommandResult = z.infer<typeof accountCommandResultSchema>;
