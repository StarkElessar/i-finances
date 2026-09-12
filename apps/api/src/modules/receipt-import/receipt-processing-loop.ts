import type { LiteLlmClient } from './litellm-client';
import { normalizeReceiptImageForModel } from './receipt-image-normalizer';
import type { ReceiptImageStorage } from './receipt-image-storage';
import type { ClaimedReceiptProcessingJob, ReceiptImportService } from './receipt-import-service';

export type ReceiptProcessingLoopOptions = {
	imageStorage: Pick<ReceiptImageStorage, 'read'>;
	litellmClient: LiteLlmClient;
	pollIntervalMs: number;
	receiptImportService: Pick<ReceiptImportService, 'claimNextQueuedJob' | 'completeJob' | 'failJob'>;
};

export type ReceiptProcessingLoop = {
	stop: () => void;
};

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolveSleep) => {
		setTimeout(resolveSleep, milliseconds);
	});
}

async function processJob(
	job: ClaimedReceiptProcessingJob,
	options: ReceiptProcessingLoopOptions
): Promise<void> {
	try {
		const imageBytes = await options.imageStorage.read(job.imageStorageKey);
		const normalized = await normalizeReceiptImageForModel(imageBytes);
		const ocrText = await options.litellmClient.extractReceiptText(normalized.bytes, normalized.contentType);
		const result = await options.litellmClient.categorizeReceipt({
			categories: job.categories,
			contacts: job.contacts,
			ocrText,
			previousResult: job.previousResult,
			reviewComment: job.reviewComment,
			startedAt: new Date()
		});

		await options.receiptImportService.completeJob(job.processingJobId, result);
	}
	catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);

		await options.receiptImportService.failJob(job.processingJobId, message);
	}
}

export function startReceiptProcessingLoop(options: ReceiptProcessingLoopOptions): ReceiptProcessingLoop {
	let stopped = false;

	const loop = async (): Promise<void> => {
		while (!stopped) {
			let job: ClaimedReceiptProcessingJob | undefined;

			try {
				job = await options.receiptImportService.claimNextQueuedJob();
			}
			catch (error: unknown) {
				console.error('Failed to claim the next queued receipt processing job.', error);
				await sleep(options.pollIntervalMs);
				continue;
			}

			if (job === undefined) {
				await sleep(options.pollIntervalMs);
				continue;
			}

			await processJob(job, options);
		}
	};

	void loop();

	return {
		stop: () => {
			stopped = true;
		}
	};
}
