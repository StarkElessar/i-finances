import { parseReceiptCategoriesSnapshot } from '@/modules/receipt-import/receipt-import-mappers';

import { describe, expect, it } from 'vitest';

describe('receipt import mappers', () => {
	it('fills the description for snapshots created before category descriptions existed', () => {
		const categories = parseReceiptCategoriesSnapshot(JSON.stringify([{
			id: 'category-food',
			keywords: ['продукты'],
			name: 'Продукты'
		}]));

		expect(categories).toEqual([{
			description: '',
			id: 'category-food',
			keywords: ['продукты'],
			name: 'Продукты'
		}]);
	});
});
