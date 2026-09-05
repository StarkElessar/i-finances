import { readOperationFields } from '@/features/operations/model';

import { describe, expect, it } from 'vitest';

describe('operation form model', () => {
	it('converts localized money input and empty references to the public command shape', () => {
		const formData = new FormData();

		formData.set('amount', '1 234,50');
		formData.set('categoryId', 'category-food');
		formData.set('comment', '  Чек  ');
		formData.set('contactId', '');
		formData.set('happenedOn', '2026-08-08');
		formData.set('title', '  Продукты  ');
		formData.set('type', 'expense');

		expect(readOperationFields(formData, 'account-main')).toEqual({
			accountId: 'account-main',
			amountMinor: 123_450,
			categoryId: 'category-food',
			comment: 'Чек',
			contactId: null,
			happenedOn: '2026-08-08',
			title: 'Продукты',
			type: 'expense'
		});
	});

	it('rejects invalid money before sending a command', () => {
		const formData = new FormData();

		formData.set('amount', '1.234');
		formData.set('happenedOn', '2026-08-08');
		formData.set('title', 'Покупка');
		formData.set('type', 'expense');

		expect(readOperationFields(formData, 'account-main')).toBeUndefined();
	});
});
