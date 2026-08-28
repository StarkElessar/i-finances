import { normalizeExchangeRate } from '~/shared/lib';

import { tryParseLocalDateKey } from '~/entities/operation/model/period';

import { z } from 'zod';

import { normalizeTransferComment } from '../model/normalization';
import type { Transfer } from '../model/types';

const entityIdSchema = z.string().trim().min(1).max(128);
const transferVersionSchema = z.number().int().positive();
const localDateKeySchema = z.string().refine(
	(value) => tryParseLocalDateKey(value) !== undefined,
	'Укажите существующую дату.'
);
const optionalReferenceIdSchema = entityIdSchema.nullable();

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
		.transform(normalizeTransferComment)
		.pipe(z.string().max(1000)),
	contactId: optionalReferenceIdSchema,
	exchangeRate: exchangeRateSchema,
	fromAccountId: entityIdSchema,
	fromAmountMinor: z.number()
		.int()
		.positive('Сумма должна быть больше нуля.')
		.max(Number.MAX_SAFE_INTEGER),
	happenedOn: localDateKeySchema,
	toAccountId: entityIdSchema
};

export const createTransferInputSchema = z.object(editableTransferFields);

export const updateTransferInputSchema = z.object({
	...editableTransferFields,
	id: entityIdSchema,
	version: transferVersionSchema
});

export const changeTransferDeletionStateInputSchema = z.object({
	id: entityIdSchema,
	version: transferVersionSchema
});

export const getTransferInputSchema = z.object({
	id: entityIdSchema
});

export type CreateTransferInput = z.infer<typeof createTransferInputSchema>;
export type UpdateTransferInput = z.infer<typeof updateTransferInputSchema>;
export type ChangeTransferDeletionStateInput = z.infer<
	typeof changeTransferDeletionStateInputSchema
>;
export type GetTransferInput = z.infer<typeof getTransferInputSchema>;

export type TransferCommandErrorCode =
	| 'conflict'
	| 'forbidden'
	| 'invalid-input'
	| 'invalid-state'
	| 'not-found'
	| 'rate-unavailable'
	| 'reference-unavailable'
	| 'unauthenticated';

export type TransferCommandResult =
	| {
		ok: true;
		transfer: Transfer;
	}
	| {
		errorCode: TransferCommandErrorCode;
		fieldErrors?: Record<string, string>;
		message: string;
		ok: false;
	};
