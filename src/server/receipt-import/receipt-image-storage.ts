import { createHash } from 'node:crypto';
import {
	mkdir,
	readFile,
	rename,
	rm,
	writeFile
} from 'node:fs/promises';
import {
	basename,
	dirname,
	resolve
} from 'node:path';

import { ReceiptImageValidationError } from './receipt-import-errors';

const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const EXTENSION_BY_CONTENT_TYPE = {
	'image/heic': '.heic',
	'image/jpeg': '.jpg',
	'image/png': '.png'
} as const;

type SupportedReceiptImageContentType =
	keyof typeof EXTENSION_BY_CONTENT_TYPE;

export type StoredReceiptImage = {
	contentSha256: string;
	contentType: SupportedReceiptImageContentType;
	originalName: string;
	sizeBytes: number;
	storageKey: string;
};

export type SaveReceiptImageInput = {
	bytes: Uint8Array;
	contentType: string;
	originalName: string;
	receiptImportId: string;
};

export type ReceiptImageStorage = {
	delete: (storageKey: string) => Promise<void>;
	read: (storageKey: string) => Promise<Uint8Array>;
	save: (input: SaveReceiptImageInput) => Promise<StoredReceiptImage>;
};

export type ReceiptImageStorageOptions = {
	maxImageBytes?: number;
	rootDirectory?: string;
};

function isSupportedContentType(
	contentType: string
): contentType is SupportedReceiptImageContentType {
	return contentType in EXTENSION_BY_CONTENT_TYPE;
}

function normalizeOriginalName(originalName: string): string {
	const normalizedName = basename(originalName.trim());

	return normalizedName.slice(0, 255) || 'receipt';
}

/**
 * Creates private filesystem storage for uploaded receipt images.
 */
export function createReceiptImageStorage(
	options: ReceiptImageStorageOptions = {}
): ReceiptImageStorage {
	const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
	const rootDirectory = resolve(
		options.rootDirectory
			?? process.env.RECEIPT_IMAGE_ROOT
			?? './static/receipts'
	);

	const resolveStoragePath = (storageKey: string): string => {
		if (storageKey !== basename(storageKey) || storageKey.includes('\0')) {
			throw new ReceiptImageValidationError(
				'Некорректный адрес изображения.'
			);
		}

		return resolve(rootDirectory, storageKey);
	};

	const save = async (
		input: SaveReceiptImageInput
	): Promise<StoredReceiptImage> => {
		if (!isSupportedContentType(input.contentType)) {
			throw new ReceiptImageValidationError(
				'Поддерживаются изображения JPEG, PNG и HEIC.'
			);
		}

		if (input.bytes.byteLength === 0) {
			throw new ReceiptImageValidationError('Выберите непустой файл.');
		}

		if (input.bytes.byteLength > maxImageBytes) {
			throw new ReceiptImageValidationError(
				`Размер изображения не должен превышать ${
					Math.floor(maxImageBytes / 1024 / 1024)
				} МБ.`
			);
		}

		const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType];
		const storageKey = `${input.receiptImportId}${extension}`;
		const targetPath = resolveStoragePath(storageKey);
		const temporaryPath = `${targetPath}.uploading`;

		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(temporaryPath, input.bytes, { flag: 'wx' });

		try {
			await rename(temporaryPath, targetPath);
		}
		catch (error: unknown) {
			await rm(temporaryPath, { force: true });
			throw error;
		}

		return {
			contentSha256: createHash('sha256')
				.update(input.bytes)
				.digest('hex'),
			contentType: input.contentType,
			originalName: normalizeOriginalName(input.originalName),
			sizeBytes: input.bytes.byteLength,
			storageKey
		};
	};

	const read = async (storageKey: string): Promise<Uint8Array> => {
		return readFile(resolveStoragePath(storageKey));
	};

	const deleteImage = async (storageKey: string): Promise<void> => {
		await rm(resolveStoragePath(storageKey), { force: true });
	};

	return {
		delete: deleteImage,
		read,
		save
	};
}
