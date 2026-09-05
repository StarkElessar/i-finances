import { ReceiptImportClient } from '@/features/receipt-import/api';

import { describe, expect, it } from 'vitest';

describe('ReceiptImportClient', () => {
	it('sends receipt images as multipart form data', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/receipt-imports');
			expect(init?.method).toBe('POST');
			expect(init?.headers instanceof Headers ? init.headers.get('content-type') : undefined).toBeNull();
			expect(init?.body).toBeInstanceOf(FormData);

			const body = init?.body as FormData;

			expect(body.get('image')).toBeInstanceOf(File);

			return new Response(JSON.stringify({
				ok: true,
				receiptImport: { id: 'receipt-1', status: 'queued' }
			}), { status: 201 });
		};
		const client = new ReceiptImportClient({ fetcher });

		await expect(client.create(new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }))).resolves.toEqual({
			ok: true,
			receiptImport: { id: 'receipt-1', status: 'queued' }
		});
	});

	it('serializes revision and approval commands through their feature endpoints', async () => {
		const requests: string[] = [];
		const fetcher: typeof globalThis.fetch = async (input) => {
			requests.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

			return new Response(JSON.stringify({
				receiptImport: {
					accountId: null,
					approvedAt: null,
					categories: [],
					categoriesSnapshotVersion: 'snapshot',
					createdAt: '2026-08-08T10:00:00.000Z',
					id: 'receipt-1',
					imageContentType: 'image/jpeg',
					imageDeletedAt: null,
					imageOriginalName: 'receipt.jpg',
					imageSizeBytes: 10,
					imageUrl: null,
					latestJob: {
						attempt: 1,
						completedAt: null,
						createdAt: '2026-08-08T10:00:00.000Z',
						id: 'job-1',
						lastError: null,
						status: 'queued',
						updatedAt: '2026-08-08T10:00:00.000Z',
						workerId: null
					},
					operationIds: [],
					result: null,
					reviewComment: '',
					status: 'needs_review',
					updatedAt: '2026-08-08T10:00:00.000Z',
					version: 2
				},
				ok: true
			}), { status: 200 });
		};
		const client = new ReceiptImportClient({ fetcher });

		await client.requestRevision({ comment: 'Проверить дату', id: 'receipt-1', version: 1 });
		await client.updateReview({
			id: 'receipt-1',
			review: {
				categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
				happenedOn: '2026-08-08',
				items: [{
					discountMinor: 0,
					name: 'Продукты',
					quantity: 1,
					totalMinor: 1_000,
					unitPriceMinor: 1_000
				}],
				merchant: { address: null, displayName: 'Магазин', legalName: null, unp: null },
				totalAmountMinor: 1_000
			},
			version: 2
		});
		await client.approve({ accountId: 'account-1', id: 'receipt-1', version: 2 });

		expect(requests).toEqual([
			'/api/receipt-imports/receipt-1/revision',
			'/api/receipt-imports/receipt-1/review',
			'/api/receipt-imports/receipt-1/approve'
		]);
	});
});
