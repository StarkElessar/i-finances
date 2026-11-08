import { describeUploadFailure } from '../lib/describe-upload-failure';
import { validateReceiptFile } from '../lib/receipt-file-rules';

export type ReceiptUploadFailure = {
	fileName: string;
	reason: string;
};

export type ReceiptUploadResult = {
	uploadedIds: string[];
	failures: ReceiptUploadFailure[];
};

export type CreateReceiptImport = (file: File) => Promise<{ receiptImport: { id: string } }>;

/**
 * Sends the files one after another: the API takes one image per request, and a queue spares the phone a burst of
 * parallel uploads on a mobile connection. A bad file never stops the rest.
 */
export async function uploadReceiptFiles(
	files: readonly File[],
	create: CreateReceiptImport,
	onProgress?: (current: number, total: number) => void
): Promise<ReceiptUploadResult> {
	const result: ReceiptUploadResult = { failures: [], uploadedIds: [] };

	for (const [index, file] of files.entries()) {
		onProgress?.(index + 1, files.length);

		const invalidReason = validateReceiptFile(file);

		if (invalidReason !== undefined) {
			result.failures.push({ fileName: file.name, reason: invalidReason });
			continue;
		}

		try {
			result.uploadedIds.push((await create(file)).receiptImport.id);
		}
		catch (error: unknown) {
			result.failures.push({ fileName: file.name, reason: describeUploadFailure(error) });
		}
	}

	return result;
}
