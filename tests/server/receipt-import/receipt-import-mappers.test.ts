import { describe, expect, it } from 'vitest';

import { parseReceiptCategoriesSnapshot } from '~/server/receipt-import/receipt-import-mappers';

describe('receipt import category snapshots', () => {
    it('defaults descriptions in snapshots created before the field existed', () => {
        const snapshot = JSON.stringify([{
            id: 'category-food',
            keywords: ['молоко'],
            name: 'Продукты'
        }]);

        expect(parseReceiptCategoriesSnapshot(snapshot)).toEqual([{
            description: '',
            id: 'category-food',
            keywords: ['молоко'],
            name: 'Продукты'
        }]);
    });
});
