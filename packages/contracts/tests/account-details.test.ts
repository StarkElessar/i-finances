import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
	createAccountInputSchema,
	persistedAccountSchema,
	updateAccountInputSchema
} from '../src/account';
import {
	cardAccountDetailsInputSchema,
	emptyAccountDetailsSchema,
	storedCardAccountDetailsSchema
} from '../src/account-details';
import { extractCardDigits, isLuhnValid } from '../src/card-number';
import { collectFieldErrors } from '../src/field-errors';

describe('card number helpers', () => {
	it('accepts a Luhn-valid number', () => {
		expect(isLuhnValid('4276380012345678')).toBe(false);
		expect(isLuhnValid('4111111111111111')).toBe(true);
	});

	it('rejects non-digit and empty input', () => {
		expect(isLuhnValid('')).toBe(false);
		expect(isLuhnValid('4111 1111 1111 1111')).toBe(false);
	});

	it('extracts only digits', () => {
		expect(extractCardDigits('4111 1111-1111 1111')).toBe('4111111111111111');
	});
});

describe('collectFieldErrors', () => {
	it('uses dotted paths and keeps the first message per key', () => {
		const schema = z.object({
			details: z.object({ cardNumber: z.string().min(16, 'short').regex(/^\d+$/, 'digits') }),
			name: z.string().min(1, 'name')
		});
		const result = schema.safeParse({ details: { cardNumber: 'ab' }, name: '' });

		if (result.success) {
			throw new Error('expected validation to fail');
		}

		expect(collectFieldErrors(result.error)).toEqual({
			'details.cardNumber': 'short',
			name: 'name'
		});
	});

	it('skips issues without a path', () => {
		const result = z.string().min(3, 'x').safeParse('a');

		if (result.success) {
			throw new Error('expected validation to fail');
		}

		expect(collectFieldErrors(result.error)).toEqual({});
	});
});

describe('card details input', () => {
	it('normalises spaces and accepts a valid snapshot', () => {
		const result = cardAccountDetailsInputSchema.parse({
			cardNumber: '4111 1111 1111 1111',
			expiry: '08/27'
		});

		expect(result).toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
	});

	it('accepts nulls for both fields', () => {
		expect(cardAccountDetailsInputSchema.parse({ cardNumber: null, expiry: null }))
			.toEqual({ cardNumber: null, expiry: null });
	});

	it('rejects a Luhn typo and wrong length', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: '4111111111111112', expiry: null }).success).toBe(false);
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: '4111', expiry: null }).success).toBe(false);
	});

	it('rejects months outside 01–12', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, expiry: '00/27' }).success).toBe(false);
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, expiry: '13/27' }).success).toBe(false);
	});

	it('rejects unknown keys', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, cvv: '123', expiry: null }).success).toBe(false);
	});
});

describe('other detail schemas', () => {
	it('empty details reject extra keys', () => {
		expect(emptyAccountDetailsSchema.safeParse({ cardNumber: '4111111111111111' }).success).toBe(false);
		expect(emptyAccountDetailsSchema.safeParse({}).success).toBe(true);
	});

	it('stored card details tolerate absent fields', () => {
		expect(storedCardAccountDetailsSchema.parse({})).toEqual({});
	});
});

const baseFields = {
	color: '#3f77a8',
	currency: 'BYN',
	description: '',
	initialBalanceMinor: 0,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name: 'Основная'
} as const;

describe('account input contracts', () => {
	it('defaults owner to empty string and trims it', () => {
		expect(createAccountInputSchema.parse({ ...baseFields, type: 'card' }).owner).toBe('');
		expect(createAccountInputSchema.parse({ ...baseFields, owner: '  Сергей ', type: 'card' }).owner).toBe('Сергей');
	});

	it('rejects owner longer than 60 chars', () => {
		const result = createAccountInputSchema.safeParse({ ...baseFields, owner: 'я'.repeat(61), type: 'card' });

		expect(result.success).toBe(false);
	});

	it('rejects card details on a cash account', () => {
		const result = createAccountInputSchema.safeParse({
			...baseFields,
			details: { cardNumber: '4111111111111111', expiry: null },
			type: 'cash'
		});

		expect(result.success).toBe(false);
	});

	it('accepts details omitted on create', () => {
		expect(createAccountInputSchema.safeParse({ ...baseFields, type: 'card' }).success).toBe(true);
	});

	it('update requires id and version in every branch', () => {
		expect(updateAccountInputSchema.safeParse({ ...baseFields, type: 'cash' }).success).toBe(false);
		expect(updateAccountInputSchema.safeParse({ ...baseFields, id: 'a', type: 'cash', version: 1 }).success).toBe(true);
	});

	it('persisted card exposes only last4 in the view', () => {
		const persisted = persistedAccountSchema.parse({
			...baseFields,
			archivedAt: null,
			createdAt: '2026-10-17T00:00:00.000Z',
			details: { cardNumberLast4: '1111', expiry: '08/27' },
			hasOperations: false,
			id: 'a',
			owner: 'Сергей',
			type: 'card',
			updatedAt: '2026-10-17T00:00:00.000Z',
			version: 1
		});

		expect(persisted.details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
	});
});
