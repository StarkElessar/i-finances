import {
	ACCOUNT_TYPES,
	CURRENCY_CODES
} from '~/shared/lib';

import type { PersistedAccount } from '~/entities/account/model/types';

import { z } from 'zod';

const accountIdSchema = z.string().trim().min(1).max(128);
const accountVersionSchema = z.number().int().positive();
const safeIntegerSchema = z.number()
	.int()
	.min(Number.MIN_SAFE_INTEGER)
	.max(Number.MAX_SAFE_INTEGER);

const editableAccountFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	currency: z.enum(CURRENCY_CODES),
	description: z.string().trim().max(160),
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: z.string().trim().min(1, 'Укажите название счёта.').max(120),
	type: z.enum(ACCOUNT_TYPES)
};

/**
 * Validates creation of one household account.
 */
export const createAccountInputSchema = z.object(editableAccountFields);

/**
 * Validates a complete account update with an optimistic-lock version.
 */
export const updateAccountInputSchema = z.object({
	...editableAccountFields,
	confirmCurrencyCorrection: z.boolean().default(false),
	id: accountIdSchema,
	version: accountVersionSchema
});

/**
 * Validates archive and restore commands.
 */
export const changeAccountArchiveStateInputSchema = z.object({
	id: accountIdSchema,
	version: accountVersionSchema
});

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;
export type ChangeAccountArchiveStateInput = z.infer<
	typeof changeAccountArchiveStateInputSchema
>;

export type AccountCommandErrorCode =
	| 'confirmation-required'
	| 'conflict'
	| 'forbidden'
	| 'invalid-input'
	| 'not-found'
	| 'rate-unavailable'
	| 'unauthenticated';

export type AccountCommandResult =
	| {
		account: PersistedAccount;
		ok: true;
	}
	| {
		errorCode: AccountCommandErrorCode;
		fieldErrors?: Record<string, string>;
		message: string;
		ok: false;
	};
