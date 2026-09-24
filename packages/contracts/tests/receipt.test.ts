import { describe, expect, it } from 'vitest';

import { approveReceiptInputSchema, receiptWorkerResultSchema } from '../src/receipt';

function createWorkerResultInput(receiptOverrides: Record<string, unknown> = {}) {
	return {
		categorizedItems: [{ categoryId: 'category-food', confidence: 0.9, itemIndex: 0 }],
		processor: {
			finishedAt: '2026-08-08T10:00:00.000Z',
			modelVersions: ['deepseek-v4-flash-vision-exp', 'deepseek-v4-flash'],
			pipelineVersion: 'receipt-litellm-v1',
			startedAt: '2026-08-08T10:00:00.000Z',
			workerId: 'api-inprocess'
		},
		rawOcrText: 'Продукты 12.50',
		receipt: {
			contactId: 'contact-shop',
			currency: 'BYN',
			happenedOn: '2026-08-08',
			items: [{
				discountMinor: 0,
				name: 'Продукты',
				quantity: 1,
				totalMinor: 1_250,
				unitPriceMinor: 1_250
			}],
			merchant: { address: null, displayName: 'Магазин', legalName: null, unp: null },
			totalAmountMinor: 1_250,
			...receiptOverrides
		},
		schemaVersion: 1,
		warnings: []
	};
}

describe('receiptWorkerResultSchema', () => {
	it('defaults a missing contactId to null so older results and terse model output still parse', () => {
		const input = createWorkerResultInput();

		delete (input.receipt as Record<string, unknown>).contactId;

		expect(receiptWorkerResultSchema.parse(input).receipt.contactId).toBeNull();
	});

	it('keeps an explicit contactId', () => {
		expect(receiptWorkerResultSchema.parse(createWorkerResultInput()).receipt.contactId).toBe('contact-shop');
	});
});

describe('approveReceiptInputSchema', () => {
	it('accepts a zero-amount operation for a promotional line priced at zero', () => {
		const parsed = approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: null,
			id: 'receipt-1',
			operations: [{
				amountMinor: 0,
				categoryId: null,
				itemIndexes: [1],
				title: 'Подарок по акции'
			}],
			version: 1
		});

		expect(parsed.operations[0].amountMinor).toBe(0);
	});

	it('rejects a negative operation amount', () => {
		expect(() => approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: null,
			id: 'receipt-1',
			operations: [{ amountMinor: -1, categoryId: null, itemIndexes: [0], title: 'x' }],
			version: 1
		})).toThrow();
	});

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
