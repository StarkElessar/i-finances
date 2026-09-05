import { readReceiptReviewFields } from '@/features/receipt-import/model';

import { describe, expect, it } from 'vitest';

const receipt = {
	accountId: null,
	approvedAt: null,
	categories: [{ description: '', id: 'category-food', keywords: [], name: 'Продукты' }],
	categoriesSnapshotVersion: 'snapshot',
	createdAt: '2026-08-08T10:00:00.000Z',
	id: 'receipt-1',
	imageContentType: 'image/jpeg',
	imageDeletedAt: null,
	imageOriginalName: 'receipt.jpg',
	imageSizeBytes: 100,
	imageUrl: '/api/receipt-imports/receipt-1/image',
	latestJob: {
		attempt: 1,
		completedAt: '2026-08-08T10:00:00.000Z',
		createdAt: '2026-08-08T10:00:00.000Z',
		id: 'job-1',
		lastError: null,
		status: 'completed' as const,
		updatedAt: '2026-08-08T10:00:00.000Z',
		workerId: 'worker-1'
	},
	operationIds: [],
	result: {
		categorizedItems: [{ categoryId: 'category-food', confidence: 0.9, itemIndex: 0 }],
		processor: {
			finishedAt: '2026-08-08T10:00:00.000Z',
			modelVersions: ['test'],
			pipelineVersion: 'test',
			startedAt: '2026-08-08T10:00:00.000Z',
			workerId: 'worker-1'
		},
		rawOcrText: '',
		receipt: {
			currency: 'BYN' as const,
			happenedOn: '2026-08-08',
			items: [{
				discountMinor: 0,
				name: 'Продукты',
				quantity: 1,
				totalMinor: 1_250,
				unitPriceMinor: 1_250
			}],
			merchant: {
				address: null,
				displayName: 'Магазин',
				legalName: null,
				unp: null
			},
			totalAmountMinor: 1_250
		},
		schemaVersion: 1 as const,
		warnings: []
	},
	reviewComment: '',
	status: 'needs_review' as const,
	updatedAt: '2026-08-08T10:00:00.000Z',
	version: 1
};

describe('receipt review model', () => {
	it('reads edited merchant, amounts, date and category from the review form', () => {
		const formData = new FormData();
		formData.set('happenedOn', '2026-08-07');
		formData.set('merchant-display-name', 'Исправленный магазин');
		formData.set('merchant-legal-name', 'ООО Магазин');
		formData.set('merchant-address', 'Минск');
		formData.set('merchant-unp', '123456789');
		formData.set('total-amount', '13,00');
		formData.set('item-0-name', 'Исправленные продукты');
		formData.set('item-0-quantity', '1');
		formData.set('item-0-unit-price', '13.00');
		formData.set('item-0-discount', '0');
		formData.set('item-0-total', '13.00');
		formData.set('item-0-category', 'category-food');

		expect(readReceiptReviewFields(formData, receipt)).toMatchObject({
			categorizedItems: [{ categoryId: 'category-food', itemIndex: 0 }],
			happenedOn: '2026-08-07',
			items: [{ name: 'Исправленные продукты', totalMinor: 1_300 }],
			merchant: { displayName: 'Исправленный магазин' },
			totalAmountMinor: 1_300
		});
	});

	it('rejects malformed monetary input before sending it to the API', () => {
		const formData = new FormData();
		formData.set('happenedOn', '2026-08-07');
		formData.set('total-amount', '13.000');
		formData.set('item-0-name', 'Продукты');
		formData.set('item-0-total', '13.00');
		formData.set('item-0-category', 'category-food');

		expect(readReceiptReviewFields(formData, receipt)).toBeUndefined();
	});
});
