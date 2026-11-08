import { useToaster } from '@/shared/ui/toast';

import { getReceiptImports } from '@/entities/receipt-import';

import { ReceiptImportClient } from '@/features/receipt-import';

import { revalidate, useNavigate } from '@solidjs/router';
import type { JSX } from 'solid-js';
import { onCleanup } from 'solid-js';

import {
	processingFailedMessage,
	readyMessage,
	uploadedMessage,
	uploadFailedMessage,
	uploadingMessage
} from '../lib/receipt-upload-messages';
import { ReceiptUploadContext } from '../model/receipt-upload-context';
import { type ReceiptReadiness, trackReceiptReadiness } from '../model/track-receipt-readiness';
import { uploadReceiptFiles } from '../model/upload-receipt-files';

const RECEIPTS_PATH = '/receipts';

export type ReceiptUploadProviderProps = {
	children: JSX.Element;
	client?: ReceiptImportClient;
};

/**
 * Uploads receipt photos in the background and reports through the application toaster. Mount it inside the
 * router and the toaster, above the pages: an upload and the «чек готов» watch then outlive page changes.
 */
export function ReceiptUploadProvider(props: ReceiptUploadProviderProps) {
	const toaster = useToaster();
	const navigate = useNavigate();
	const client = props.client ?? new ReceiptImportClient();
	const watches = new Set<() => void>();
	let queue: Promise<void> = Promise.resolve();

	const openReceipts = (): void => {
		navigate(RECEIPTS_PATH);
	};

	const reportReadiness = ({ failed, ready }: ReceiptReadiness): void => {
		if (ready > 0) {
			toaster.show({ action: { label: 'Проверить', onClick: openReceipts }, message: readyMessage(ready), tone: 'success' });
		}

		if (failed > 0) {
			toaster.show({ action: { label: 'К чекам', onClick: openReceipts }, message: processingFailedMessage(failed), tone: 'error' });
		}
	};

	const watchReadiness = (ids: readonly string[], uploadedToastId: number): void => {
		const stop = trackReceiptReadiness({
			ids,
			list: () => client.list(),
			onSettled: (readiness) => {
				watches.delete(stop);
				// The receipts page may be open: bring its list up to date together with the toast.
				void revalidate(getReceiptImports.key);
				// «Загружено, обрабатываются» is out of date from now on.
				toaster.dismiss(uploadedToastId);
				reportReadiness(readiness);
			}
		});

		watches.add(stop);
	};

	const run = async (files: readonly File[]): Promise<void> => {
		const progressId = toaster.show({ duration: 0, message: uploadingMessage(1, files.length) });
		const result = await uploadReceiptFiles(
			files,
			(file) => client.create(file),
			(current, total) => toaster.update(progressId, { message: uploadingMessage(current, total) })
		);

		toaster.dismiss(progressId);

		if (result.uploadedIds.length > 0) {
			const uploadedToastId = toaster.show({
				action: { label: 'К чекам', onClick: openReceipts },
				message: uploadedMessage(result.uploadedIds.length),
				tone: 'success'
			});
			// The receipts page may be open behind the toast: show the new rows at once.
			void revalidate(getReceiptImports.key);
			watchReadiness(result.uploadedIds, uploadedToastId);
		}

		if (result.failures.length > 0) {
			toaster.show({
				message: uploadFailedMessage(result.failures.length, files.length, result.failures[0].reason),
				tone: 'error'
			});
		}
	};

	const upload = (files: readonly File[]): void => {
		if (files.length === 0) {
			return;
		}

		// One batch at a time: a second pick waits for the first to finish.
		queue = queue.then(() => run(files)).catch(() => {
			toaster.show({ message: 'Не удалось загрузить чек', tone: 'error' });
		});
	};

	onCleanup(() => {
		for (const stop of watches) {
			stop();
		}
	});

	return (
		<ReceiptUploadContext.Provider value={{ upload }}>
			{props.children}
		</ReceiptUploadContext.Provider>
	);
}
