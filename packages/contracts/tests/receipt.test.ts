import { approveReceiptInputSchema } from '../src/receipt';
import { describe, expect, it } from 'vitest';

describe('approveReceiptInputSchema', () => {
	it('accepts an explicit list of finalized operations with a receipt-level contact', () => {
		const parsed = approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: 'contact-1',
			id: 'receipt-1',
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: 3
		});

		expect(parsed.operations).toHaveLength(1);
		expect(parsed.contactId).toBe('contact-1');
	});

	it('rejects an operation with no item indexes', () => {
		expect(() => approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: null,
			id: 'receipt-1',
			operations: [{ amountMinor: 100, categoryId: null, itemIndexes: [], title: 'x' }],
			version: 1
		})).toThrow();
	});
});
