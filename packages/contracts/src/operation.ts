import { z } from 'zod';

import { currencyCodeSchema } from './category';

export const operationTypeSchema = z.enum(['expense', 'income']);

export type OperationType = z.infer<typeof operationTypeSchema>;

const operationIdSchema = z.string().trim().min(1).max(128);
const operationVersionSchema = z.number().int().positive();
const safeIntegerSchema = z.number()
	.int()
	.min(Number.MIN_SAFE_INTEGER)
	.max(Number.MAX_SAFE_INTEGER);

function isValidLocalDateKey(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

	if (match === null) {
		return false;
	}

	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);

	return date.getFullYear() === Number(match[1])
		&& date.getMonth() === Number(match[2]) - 1
		&& date.getDate() === Number(match[3]);
}

const localDateKeySchema = z.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажите существующую дату.')
	.refine(isValidLocalDateKey, 'Укажите существующую дату.');
const operationTitleSchema = z.string()
	.transform((value) => value.trim().replace(/\s+/g, ' '))
	.pipe(z.string().min(1, 'Укажите название операции.').max(160));
const operationCommentSchema = z.string()
	.transform((value) => value.trim().replace(/\s+/g, ' '))
	.pipe(z.string().max(1_000));
const optionalReferenceIdSchema = operationIdSchema.nullable();
const editableOperationFields = {
	amountMinor: z.number()
		.int()
		.positive('Сумма должна быть больше нуля.')
		.max(Number.MAX_SAFE_INTEGER),
	categoryId: optionalReferenceIdSchema,
	comment: operationCommentSchema,
	contactId: optionalReferenceIdSchema,
	happenedOn: localDateKeySchema,
	title: operationTitleSchema,
	type: operationTypeSchema
};

export const createOperationInputSchema = z.object({
	...editableOperationFields,
	accountId: operationIdSchema
});

export type CreateOperationInput = z.infer<typeof createOperationInputSchema>;

export const updateOperationInputSchema = z.object({
	...editableOperationFields,
	id: operationIdSchema,
	version: operationVersionSchema
});

export type UpdateOperationInput = z.infer<typeof updateOperationInputSchema>;

export const changeOperationDeletionStateInputSchema = z.object({
	id: operationIdSchema,
	version: operationVersionSchema
});

export type ChangeOperationDeletionStateInput = z.infer<
	typeof changeOperationDeletionStateInputSchema
>;

export const recalculateOperationRateInputSchema = z.object({
	id: operationIdSchema,
	version: operationVersionSchema
});

export type RecalculateOperationRateInput = z.infer<
	typeof recalculateOperationRateInputSchema
>;

export const getAccountLedgerInputSchema = z.object({
	accountId: operationIdSchema,
	end: localDateKeySchema,
	start: localDateKeySchema
}).refine(
	(input) => input.start <= input.end,
	{
		message: 'Начало периода должно быть не позже окончания.',
		path: ['end']
	}
);

export type GetAccountLedgerInput = z.infer<typeof getAccountLedgerInputSchema>;

export const getMonthlyExpenseSummaryInputSchema = z.object({
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Укажите месяц в формате ГГГГ-ММ.')
});

export type GetMonthlyExpenseSummaryInput = z.infer<
	typeof getMonthlyExpenseSummaryInputSchema
>;

const operationDateSchema = z.string().min(1);
const operationExchangeRateSchema = z.object({
	effectiveOn: localDateKeySchema,
	fromCurrency: currencyCodeSchema,
	rate: z.string().min(1),
	source: z.string().min(1),
	toCurrency: currencyCodeSchema
});

export type OperationExchangeRate = z.infer<typeof operationExchangeRateSchema>;

export const persistedOperationSchema = z.object({
	accountId: operationIdSchema,
	amountInHouseholdBaseCurrencyMinor: safeIntegerSchema,
	amountMinor: safeIntegerSchema,
	categoryId: operationIdSchema.nullable(),
	categoryName: z.string().nullable(),
	comment: z.string(),
	contactId: operationIdSchema.nullable(),
	contactName: z.string().nullable(),
	createdAt: operationDateSchema,
	currency: currencyCodeSchema,
	deletedAt: operationDateSchema.nullable(),
	deletedByUserId: z.string().nullable(),
	exchangeRate: operationExchangeRateSchema,
	happenedOn: localDateKeySchema,
	householdBaseCurrency: currencyCodeSchema,
	id: operationIdSchema,
	sourceOrder: z.number().int(),
	title: z.string().min(1),
	type: operationTypeSchema,
	updatedAt: operationDateSchema,
	version: operationVersionSchema
});

export type PersistedOperation = z.infer<typeof persistedOperationSchema>;

export const operationWithBalanceSchema = persistedOperationSchema.extend({
	balanceAfterMinor: safeIntegerSchema,
	signedAmountMinor: safeIntegerSchema
});

export type OperationWithBalance = z.infer<typeof operationWithBalanceSchema>;

export const accountLedgerSchema = z.object({
	accountCurrency: currencyCodeSchema,
	accountId: operationIdSchema,
	closingBalanceMinor: safeIntegerSchema,
	householdBaseCurrency: currencyCodeSchema,
	items: z.array(operationWithBalanceSchema),
	openingBalanceMinor: safeIntegerSchema,
	range: z.object({
		end: localDateKeySchema,
		start: localDateKeySchema
	})
});

export type AccountLedger = z.infer<typeof accountLedgerSchema>;

export const accountBalanceSchema = z.object({
	accountId: operationIdSchema,
	balanceMinor: safeIntegerSchema,
	currency: currencyCodeSchema
});

export type AccountBalance = z.infer<typeof accountBalanceSchema>;
export const accountBalancesSchema = z.array(accountBalanceSchema);

export const monthlyExpenseSummarySchema = z.object({
	baseCurrency: currencyCodeSchema,
	categoryExpensesMinor: z.record(z.string(), safeIntegerSchema),
	contactExpensesMinor: z.record(z.string(), safeIntegerSchema),
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
});

export type MonthlyExpenseSummary = z.infer<typeof monthlyExpenseSummarySchema>;

export const operationCommandErrorCodeSchema = z.enum([
	'conflict',
	'forbidden',
	'invalid-input',
	'invalid-state',
	'not-found',
	'rate-unavailable',
	'reference-unavailable',
	'unauthenticated'
]);

export type OperationCommandErrorCode = z.infer<typeof operationCommandErrorCodeSchema>;

export const operationCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		operation: persistedOperationSchema,
		ok: z.literal(true)
	}),
	z.object({
		errorCode: operationCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type OperationCommandResult = z.infer<typeof operationCommandResultSchema>;
