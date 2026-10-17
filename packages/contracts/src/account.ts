import { z } from 'zod';

import {
	cardAccountDetailsFullSchema,
	cardAccountDetailsInputSchema,
	cardAccountDetailsViewSchema,
	emptyAccountDetailsSchema
} from './account-details';
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

const accountOwnerSchema = z.string()
	.trim()
	.max(60, 'Не длиннее 60 символов.')
	.default('');

const editableAccountFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	currency: currencyCodeSchema,
	description: accountDescriptionSchema,
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: accountNameSchema,
	owner: accountOwnerSchema
};

const updateIdentityFields = {
	id: accountIdSchema,
	version: accountVersionSchema
};

export const accountListInputSchema = z.object({
	includeArchived: z.preprocess(
		(value) => value === 'true' || value === true,
		z.boolean().default(false)
	)
});

export type AccountListInput = z.infer<typeof accountListInputSchema>;

export const createAccountInputSchema = z.discriminatedUnion('type', [
	z.object({ ...editableAccountFields, details: cardAccountDetailsInputSchema.optional(), type: z.literal('card') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('cash') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('other') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('savings') })
]);

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

const updateAccountFields = { ...editableAccountFields, ...updateIdentityFields };

export const updateAccountInputSchema = z.discriminatedUnion('type', [
	z.object({ ...updateAccountFields, details: cardAccountDetailsInputSchema.optional(), type: z.literal('card') }),
	z.object({ ...updateAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('cash') }),
	z.object({ ...updateAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('other') }),
	z.object({ ...updateAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('savings') })
]);

export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

export const changeAccountArchiveStateInputSchema = z.object({
	id: accountIdSchema,
	version: accountVersionSchema
});

export type ChangeAccountArchiveStateInput = z.infer<
	typeof changeAccountArchiveStateInputSchema
>;

const accountDateSchema = z.string().min(1);

const persistedAccountFields = {
	archivedAt: accountDateSchema.nullable(),
	color: z.string(),
	createdAt: accountDateSchema,
	currency: currencyCodeSchema,
	description: z.string(),
	hasOperations: z.boolean(),
	id: z.string().min(1),
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: z.string().min(1),
	owner: z.string(),
	updatedAt: accountDateSchema,
	version: accountVersionSchema
};

export const persistedAccountSchema = z.discriminatedUnion('type', [
	z.object({ ...persistedAccountFields, details: cardAccountDetailsViewSchema, type: z.literal('card') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('cash') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('other') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('savings') })
]);

/**
 * One account with full details, for the edit form (`GET /api/accounts/:id`).
 */
export const persistedAccountFullSchema = z.discriminatedUnion('type', [
	z.object({ ...persistedAccountFields, details: cardAccountDetailsFullSchema, type: z.literal('card') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('cash') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('other') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('savings') })
]);

export type PersistedAccountFull = z.infer<typeof persistedAccountFullSchema>;

export type PersistedAccount = z.infer<typeof persistedAccountSchema>;

export const accountCollectionSchema = z.object({
	baseCurrency: currencyCodeSchema,
	items: z.array(persistedAccountSchema)
});

export type AccountCollection = z.infer<typeof accountCollectionSchema>;

export const accountCommandErrorCodeSchema = z.enum([
	'conflict',
	'currency-locked',
	'forbidden',
	'invalid-input',
	'not-found',
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
