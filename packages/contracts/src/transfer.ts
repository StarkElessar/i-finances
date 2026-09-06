import { z } from 'zod';

import { currencyCodeSchema } from './category';
import { normalizeExchangeRate } from './decimal-money';
import { isValidLocalDateKey } from './operation';

const transferIdSchema = z.string().trim().min(1).max(128);
const transferVersionSchema = z.number().int().positive();
const localDateKeySchema = z.string().refine(
	isValidLocalDateKey,
	'Укажите существующую дату.'
);
const optionalReferenceIdSchema = transferIdSchema.nullable();

const exchangeRateSchema = z.string()
	.trim()
	.transform((value, context) => {
		const normalizedRate = normalizeExchangeRate(value);

		if (normalizedRate === undefined) {
			context.addIssue({
				code: 'custom',
				message: 'Укажите корректный курс обмена.'
			});

			return z.NEVER;
		}

		return normalizedRate;
	});

const editableTransferFields = {
	comment: z.string()
		.transform((value) => value.trim())
		.pipe(z.string().max(1_000)),
	contactId: optionalReferenceIdSchema,
	exchangeRate: exchangeRateSchema,
	fromAccountId: transferIdSchema,
	fromAmountMinor: z.number()
		.int()
		.positive('Сумма должна быть больше нуля.')
		.max(Number.MAX_SAFE_INTEGER),
	happenedOn: localDateKeySchema,
	toAccountId: transferIdSchema
};

export const createTransferInputSchema = z.object(editableTransferFields);

export type CreateTransferInput = z.infer<typeof createTransferInputSchema>;

export const updateTransferInputSchema = z.object({
	...editableTransferFields,
	id: transferIdSchema,
	version: transferVersionSchema
});

export type UpdateTransferInput = z.infer<typeof updateTransferInputSchema>;

export const changeTransferDeletionStateInputSchema = z.object({
	id: transferIdSchema,
	version: transferVersionSchema
});

export type ChangeTransferDeletionStateInput = z.infer<
	typeof changeTransferDeletionStateInputSchema
>;

export const getTransferInputSchema = z.object({ id: transferIdSchema });

export type GetTransferInput = z.infer<typeof getTransferInputSchema>;

const transferDateSchema = z.string().min(1);

export const transferSchema = z.object({
	comment: z.string(),
	contactId: transferIdSchema.nullable(),
	contactName: z.string().nullable(),
	createdAt: transferDateSchema,
	deletedAt: transferDateSchema.nullable(),
	deletedByUserId: z.string().nullable(),
	exchangeFromCurrency: currencyCodeSchema,
	exchangeRate: z.string().min(1),
	exchangeToCurrency: currencyCodeSchema,
	fromAccountId: transferIdSchema,
	fromAmountMinor: z.number().int(),
	fromOperationId: transferIdSchema,
	happenedOn: localDateKeySchema,
	id: transferIdSchema,
	toAccountId: transferIdSchema,
	toAmountMinor: z.number().int(),
	toOperationId: transferIdSchema,
	updatedAt: transferDateSchema,
	version: transferVersionSchema
});

export type Transfer = z.infer<typeof transferSchema>;

export const transferCommandErrorCodeSchema = z.enum([
	'conflict',
	'forbidden',
	'invalid-input',
	'invalid-state',
	'not-found',
	'rate-unavailable',
	'reference-unavailable',
	'unauthenticated'
]);

export type TransferCommandErrorCode = z.infer<typeof transferCommandErrorCodeSchema>;

export const transferCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		ok: z.literal(true),
		transfer: transferSchema
	}),
	z.object({
		errorCode: transferCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type TransferCommandResult = z.infer<typeof transferCommandResultSchema>;
