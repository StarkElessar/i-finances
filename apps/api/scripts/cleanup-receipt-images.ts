import { sqlite } from '@/infrastructure/database/client';
import { createApiDependencies } from '@/composition-root';

/**
 * Deletes stored receipt photos whose retention period has passed.
 */
async function cleanupReceiptImages(): Promise<void> {
	const { receiptImportService } = createApiDependencies();
	const { deletedCount } = await receiptImportService.deleteExpiredImages();

	console.warn(`Deleted ${deletedCount} receipt image(s) past retention.`);
}

cleanupReceiptImages()
	.catch((error: unknown) => {
		console.error('Failed to clean up receipt images.', error);
		process.exitCode = 1;
	})
	.finally(() => {
		sqlite.close();
	});
