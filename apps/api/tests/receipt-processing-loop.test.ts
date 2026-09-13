import { normalizeReceiptImageForModel } from '@/modules/receipt-import/receipt-image-normalizer';
import { startReceiptProcessingLoop } from '@/modules/receipt-import/receipt-processing-loop';

import type { ReceiptWorkerResult } from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/receipt-import/receipt-image-normalizer', () => ({
	normalizeReceiptImageForModel: vi.fn()
}));

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

const mockedNormalize = vi.mocked(normalizeReceiptImageForModel);

const SAMPLE_RESULT: ReceiptWorkerResult = {
	categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
	processor: {
		finishedAt: '2026-08-08T10:00:00.000Z',
		modelVersions: ['deepseek-flash'],
		pipelineVersion: 'receipt-litellm-v2',
		startedAt: '2026-08-08T10:00:00.000Z',
		workerId: 'api-inprocess'
	},
	rawOcrText: 'text',
	receipt: {
		contactId: null,
		currency: 'BYN',
		happenedOn: '2026-08-08',
		items: [{ discountMinor: 0, name: 'x', quantity: 1, totalMinor: 100, unitPriceMinor: 100 }],
		merchant: { address: null, displayName: null, legalName: null, unp: null },
		totalAmountMinor: 100
	},
	schemaVersion: 1,
	warnings: []
};

function claimOnceThenIdle() {
	return vi.fn()
		.mockResolvedValueOnce({
			attempt: 1,
			categories: [],
			contacts: [],
			imageStorageKey: 'key-1',
			previousResult: null,
			processingJobId: 'job-1',
			receiptImportId: 'receipt-1',
			requestedPipelineVersion: 'receipt-litellm-v2',
			reviewComment: ''
		})
		.mockResolvedValue(undefined);
}

describe('startReceiptProcessingLoop', () => {
	it('processes one queued job end to end and then waits when the queue is empty', async () => {
		mockedNormalize.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), contentType: 'image/jpeg' });

		const claimNextQueuedJob = claimOnceThenIdle();
		const completeJob = vi.fn().mockResolvedValue(undefined);
		const failJob = vi.fn().mockResolvedValue(undefined);
		const readImage = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
		const processReceiptImage = vi.fn().mockResolvedValue(SAMPLE_RESULT);

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: readImage },
			litellmClient: { processReceiptImage },
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob }
		});

		await sleep(100);
		loop.stop();

		expect(readImage).toHaveBeenCalledWith('key-1');
		expect(processReceiptImage).toHaveBeenCalledTimes(1);
		expect(completeJob).toHaveBeenCalledWith('job-1', SAMPLE_RESULT);
		expect(failJob).not.toHaveBeenCalled();
	});

	it('fails the job when the model call throws, instead of crashing the loop', async () => {
		mockedNormalize.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), contentType: 'image/jpeg' });

		const claimNextQueuedJob = claimOnceThenIdle();
		const completeJob = vi.fn();
		const failJob = vi.fn().mockResolvedValue(undefined);

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: vi.fn().mockResolvedValue(new Uint8Array([1])) },
			litellmClient: {
				processReceiptImage: vi.fn().mockRejectedValue(new Error('timeout'))
			},
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob }
		});

		await sleep(100);
		loop.stop();

		expect(failJob).toHaveBeenCalledWith('job-1', 'timeout');
		expect(completeJob).not.toHaveBeenCalled();
	});

	it('fails the job when image normalization throws, instead of crashing the loop', async () => {
		mockedNormalize.mockRejectedValue(new Error('corrupt image'));

		const claimNextQueuedJob = claimOnceThenIdle();
		const completeJob = vi.fn();
		const failJob = vi.fn().mockResolvedValue(undefined);
		const processReceiptImage = vi.fn();

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: vi.fn().mockResolvedValue(new Uint8Array([1])) },
			litellmClient: { processReceiptImage },
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob }
		});

		await sleep(100);
		loop.stop();

		expect(failJob).toHaveBeenCalledWith('job-1', 'corrupt image');
		expect(completeJob).not.toHaveBeenCalled();
		expect(processReceiptImage).not.toHaveBeenCalled();
	});

	it('survives failJob itself throwing and keeps polling afterwards', async () => {
		mockedNormalize.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), contentType: 'image/jpeg' });

		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const unhandledRejections: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);

		process.on('unhandledRejection', onUnhandledRejection);

		const claimNextQueuedJob = claimOnceThenIdle();
		const completeJob = vi.fn();
		// Both the processing step and the failure bookkeeping blow up.
		const failJob = vi.fn().mockRejectedValueOnce(new Error('SQLITE_BUSY'));

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: vi.fn().mockResolvedValue(new Uint8Array([1])) },
			litellmClient: {
				processReceiptImage: vi.fn().mockRejectedValue(new Error('categorization failed'))
			},
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob }
		});

		await sleep(120);
		loop.stop();
		await sleep(40);
		process.off('unhandledRejection', onUnhandledRejection);

		expect(failJob).toHaveBeenCalledWith('job-1', 'categorization failed');
		expect(completeJob).not.toHaveBeenCalled();
		expect(unhandledRejections).toEqual([]);
		// The loop kept polling instead of dying with the rejection.
		expect(claimNextQueuedJob.mock.calls.length).toBeGreaterThan(1);
		expect(consoleErrorSpy).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});

	it('survives claimNextQueuedJob throwing and keeps polling afterwards', async () => {
		mockedNormalize.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), contentType: 'image/jpeg' });

		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const claimNextQueuedJob = vi.fn()
			.mockRejectedValueOnce(new Error('connection reset'))
			.mockResolvedValueOnce({
				attempt: 1,
				categories: [],
				contacts: [],
				imageStorageKey: 'key-1',
				previousResult: null,
				processingJobId: 'job-1',
				receiptImportId: 'receipt-1',
				requestedPipelineVersion: 'receipt-litellm-v2',
				reviewComment: ''
			})
			.mockResolvedValue(undefined);
		const completeJob = vi.fn().mockResolvedValue(undefined);
		const failJob = vi.fn().mockResolvedValue(undefined);
		const readImage = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
		const processReceiptImage = vi.fn().mockResolvedValue(SAMPLE_RESULT);

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: readImage },
			litellmClient: { processReceiptImage },
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob }
		});

		await sleep(100);
		loop.stop();

		expect(claimNextQueuedJob.mock.calls.length).toBeGreaterThan(1);
		expect(completeJob).toHaveBeenCalledWith('job-1', SAMPLE_RESULT);
		expect(failJob).not.toHaveBeenCalled();
		expect(consoleErrorSpy).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});
});
