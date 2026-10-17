import { z } from 'zod';

import { isLuhnValid } from './card-number';

const cardNumberSchema = z.string()
	.transform((value) => value.replace(/\s/g, ''))
	.pipe(
		z.string()
			.regex(/^\d{16}$/, 'Номер карты — 16 цифр.')
			.refine(isLuhnValid, 'Проверьте номер карты: похоже на опечатку.')
	);

const cardExpirySchema = z.string()
	.regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Срок действия в формате ММ/ГГ.');

/**
 * Input: a full snapshot of card details; `null` means "not set".
 */
export const cardAccountDetailsInputSchema = z.strictObject({
	cardNumber: cardNumberSchema.nullable(),
	expiry: cardExpirySchema.nullable()
});

export type CardAccountDetailsInput = z.infer<typeof cardAccountDetailsInputSchema>;

/**
 * List representation (`GET /api/accounts`): never contains the full number.
 */
export const cardAccountDetailsViewSchema = z.object({
	cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
	expiry: z.string().nullable()
});

export type CardAccountDetailsView = z.infer<typeof cardAccountDetailsViewSchema>;

/**
 * Single-account representation (`GET /api/accounts/:id`) for the edit form.
 */
export const cardAccountDetailsFullSchema = cardAccountDetailsViewSchema.extend({
	cardNumber: z.string().nullable()
});

export type CardAccountDetailsFull = z.infer<typeof cardAccountDetailsFullSchema>;

/**
 * Shape persisted in `accounts.details` for cards (all fields optional).
 */
export const storedCardAccountDetailsSchema = z.object({
	cardNumber: z.string().regex(/^\d{16}$/).optional(),
	expiry: cardExpirySchema.optional()
});

export type StoredCardAccountDetails = z.infer<typeof storedCardAccountDetailsSchema>;

/**
 * Types without type-specific fields yet (cash, savings, other).
 */
export const emptyAccountDetailsSchema = z.strictObject({});

export type EmptyAccountDetails = z.infer<typeof emptyAccountDetailsSchema>;
