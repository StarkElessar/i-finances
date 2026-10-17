import { ACCOUNT_DETAILS_HANDLERS } from '@/modules/account/details/account-details-handlers';

import { describe, expect, it } from 'vitest';

const card = ACCOUNT_DETAILS_HANDLERS.card;
const cash = ACCOUNT_DETAILS_HANDLERS.cash;

describe('card details handler', () => {
	it('stores provided fields and drops nulls', () => {
		expect(card.toStored({ cardNumber: '4111111111111111', expiry: null }, undefined))
			.toEqual({ cardNumber: '4111111111111111' });
	});

	it('keeps current details when input is undefined', () => {
		expect(card.toStored(undefined, { cardNumber: '4111111111111111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
	});

	it('starts empty when neither input nor current exists', () => {
		expect(card.toStored(undefined, undefined)).toEqual({});
	});

	it('view exposes only last4, full exposes the number', () => {
		const stored = { cardNumber: '4111111111111111', expiry: '08/27' };

		expect(card.toView(stored)).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
		expect(card.toFull(stored)).toEqual({
			cardNumber: '4111111111111111',
			cardNumberLast4: '1111',
			expiry: '08/27'
		});
	});

	it('treats garbage in storage as empty details', () => {
		expect(card.toView({ cardNumber: 'oops' })).toEqual({ cardNumberLast4: null, expiry: null });
	});
});

describe('empty details handler', () => {
	it('always stores an empty object and renders empty', () => {
		expect(cash.toStored({ any: 1 }, { cardNumber: '4111111111111111' })).toEqual({});
		expect(cash.toView({ cardNumber: '4111111111111111' })).toEqual({});
		expect(cash.toFull({})).toEqual({});
	});
});
