import {
	cardDraftToInput,
	createCardDraft,
	hasCardDraftData
} from '@/features/account-details/model/card-draft';

import { describe, expect, it } from 'vitest';

describe('card draft', () => {
	it('creates an empty draft from nothing', () => {
		expect(createCardDraft(undefined)).toEqual({ cardNumber: '', expiry: '' });
		expect(createCardDraft({ cardNumber: null, cardNumberLast4: null, expiry: null })).toEqual({ cardNumber: '', expiry: '' });
	});

	it('formats stored values for the inputs', () => {
		expect(createCardDraft({ cardNumber: '4111111111111111', cardNumberLast4: '1111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111 1111 1111 1111', expiry: '08/27' });
	});

	it('converts the draft to contract input with nulls for empty fields', () => {
		expect(cardDraftToInput({ cardNumber: '4111 1111 1111 1111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
		expect(cardDraftToInput({ cardNumber: '', expiry: '' }))
			.toEqual({ cardNumber: null, expiry: null });
	});

	it('detects whether the draft holds anything', () => {
		expect(hasCardDraftData({ cardNumber: '', expiry: '' })).toBe(false);
		expect(hasCardDraftData({ cardNumber: '', expiry: '08/27' })).toBe(true);
	});
});
