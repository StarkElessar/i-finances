import { createContext, useContext } from 'solid-js';

export type ReceiptUpload = {
	/** Queues the files for upload; returns at once, progress and the outcome come as toasts. */
	upload: (files: readonly File[]) => void;
};

export const ReceiptUploadContext = createContext<ReceiptUpload>();

export function useReceiptUpload(): ReceiptUpload {
	const receiptUpload = useContext(ReceiptUploadContext);

	if (!receiptUpload) {
		throw new Error('useReceiptUpload must be used inside ReceiptUploadProvider');
	}

	return receiptUpload;
}
