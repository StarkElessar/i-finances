import { sqlite } from '../src/server/db/client';
import { receiptImportService } from '../src/server/receipt-import/receipt-import-service-instance';

/**
 * Deletes stored receipt photos whose retention period has passed.
 */
async function cleanupReceiptImages(): Promise<void> {
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
