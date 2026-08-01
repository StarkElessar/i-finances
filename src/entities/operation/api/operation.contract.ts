import { z } from 'zod';

import {
	normalizeOperationComment,
	normalizeOperationTitle
} from '../model/normalization';
import { tryParseLocalDateKey } from '../model/period';
import type {
	AccountBalance,
	AccountLedger,
	MonthlyExpenseSummary,
	Operation
} from '../model/types';

export const OPERATION_TYPES = [
	'expense',
	'income'
] as const;

const entityIdSchema = z.string().trim().min(1).max(128);
const operationVersionSchema = z.number().int().positive();
const localDateKeySchema = z.string().refine(
	(value) => tryParseLocalDateKey(value) !== undefined,
	'Укажите существующую дату.'
);
const optionalReferenceIdSchema = entityIdSchema.nullable();
const editableOperationFields = {
	amountMinor: z.number()
		.int()
		.positive('Сумма должна быть больше нуля.')
		.max(Number.MAX_SAFE_INTEGER),
	categoryId: optionalReferenceIdSchema,
	comment: z.string()
		.transform(normalizeOperationComment)
		.pipe(z.string().max(1000)),
	contactId: optionalReferenceIdSchema,
	happenedOn: localDateKeySchema,
	title: z.string()
		.transform(normalizeOperationTitle)
		.pipe(z.string()
			.min(1, 'Укажите название операции.')
			.max(160)),
	type: z.enum(OPERATION_TYPES)
};

export const getAccountLedgerInputSchema = z.object({
	accountId: entityIdSchema,
	end: localDateKeySchema,
	start: localDateKeySchema
}).refine(
	(input) => input.start <= input.end,
	{
		message: 'Начало периода должно быть не позже окончания.',
		path: ['end']
	}
);

export const createOperationInputSchema = z.object({
	...editableOperationFields,
	accountId: entityIdSchema
});

export const updateOperationInputSchema = z.object({
	...editableOperationFields,
	id: entityIdSchema,
	version: operationVersionSchema
});

export const changeOperationDeletionStateInputSchema = z.object({
	id: entityIdSchema,
	version: operationVersionSchema
});

export const recalculateOperationRateInputSchema = z.object({
	id: entityIdSchema,
	version: operationVersionSchema
});

export const getMonthlyExpenseSummaryInputSchema = z.object({
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
});

export type GetAccountLedgerInput = z.infer<typeof getAccountLedgerInputSchema>;
export type CreateOperationInput = z.infer<typeof createOperationInputSchema>;
export type UpdateOperationInput = z.infer<typeof updateOperationInputSchema>;
export type ChangeOperationDeletionStateInput = z.infer<
	typeof changeOperationDeletionStateInputSchema
>;
export type RecalculateOperationRateInput = z.infer<
	typeof recalculateOperationRateInputSchema
>;
export type GetMonthlyExpenseSummaryInput = z.infer<
	typeof getMonthlyExpenseSummaryInputSchema
>;

export type OperationCommandErrorCode =
	| 'conflict'
	| 'forbidden'
	| 'invalid-input'
	| 'invalid-state'
	| 'not-found'
	| 'rate-unavailable'
	| 'reference-unavailable'
	| 'unauthenticated';

export type OperationCommandResult =
	| {
		ok: true;
		operation: Operation;
	}
	| {
		errorCode: OperationCommandErrorCode;
		fieldErrors?: Record<string, string>;
		message: string;
		ok: false;
	};

export type AccountLedgerResult = AccountLedger;
export type AccountBalancesResult = AccountBalance[];
export type MonthlyExpenseSummaryResult = MonthlyExpenseSummary;
