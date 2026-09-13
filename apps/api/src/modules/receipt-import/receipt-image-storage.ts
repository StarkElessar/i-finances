import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { ReceiptImageValidationError } from './receipt-import-errors';
import { convertReceiptImageToJpeg } from './receipt-image-normalizer';

const DEFAULT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// Every accepted upload is re-encoded to JPEG before it touches disk (see
// convertReceiptImageToJpeg) -- HEIC goes through a pure-JS decoder first
// since the bundled sharp/libvips build has no HEVC support. The stored file
// is therefore always a single, predictable format regardless of upload.
const ACCEPTED_UPLOAD_CONTENT_TYPES = new Set([
	'image/heic',
	'image/heif',
	'image/jpeg',
	'image/png'
]);
const STORED_EXTENSION = '.jpg';
const STORED_CONTENT_TYPE = 'image/jpeg';

export type StoredReceiptImage = {
	contentSha256: string;
	contentType: typeof STORED_CONTENT_TYPE;
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

export type ReceiptImage = {
	bytes: Uint8Array;
	contentSha256: string;
	contentType: string;
	originalName: string;
	sizeBytes: number;
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

function normalizeOriginalName(originalName: string): string {
	return (basename(originalName.trim()).slice(0, 255) || 'receipt');
}

export function createReceiptImageStorage(
	options: ReceiptImageStorageOptions = {}
): ReceiptImageStorage {
	const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
	const rootDirectory = resolve(options.rootDirectory ?? process.env.RECEIPT_IMAGE_ROOT ?? './storage/receipts');

	const resolveStoragePath = (storageKey: string): string => {
		if (storageKey !== basename(storageKey) || storageKey.includes('\0')) {
			throw new ReceiptImageValidationError('Некорректный адрес изображения.');
		}

		return resolve(rootDirectory, storageKey);
	};

	const save = async (input: SaveReceiptImageInput): Promise<StoredReceiptImage> => {
		if (!ACCEPTED_UPLOAD_CONTENT_TYPES.has(input.contentType)) {
			throw new ReceiptImageValidationError('Поддерживаются изображения JPEG, PNG и HEIC.');
		}

		if (input.bytes.byteLength === 0) {
			throw new ReceiptImageValidationError('Выберите непустой файл.');
		}

		if (input.bytes.byteLength > maxImageBytes) {
			throw new ReceiptImageValidationError(`Размер изображения не должен превышать ${Math.floor(maxImageBytes / 1024 / 1024)} МБ.`);
		}

		let converted: Awaited<ReturnType<typeof convertReceiptImageToJpeg>>;

		try {
			converted = await convertReceiptImageToJpeg(input.bytes, input.contentType);
		}
		catch {
			throw new ReceiptImageValidationError('Не удалось прочитать изображение. Проверьте файл и попробуйте снова.');
		}

		const storageKey = `${input.receiptImportId}${STORED_EXTENSION}`;
		const targetPath = resolveStoragePath(storageKey);
		const temporaryPath = `${targetPath}.uploading`;

		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(temporaryPath, converted.bytes, { flag: 'wx' });

		try {
			await rename(temporaryPath, targetPath);
		}
		catch (error: unknown) {
			await rm(temporaryPath, { force: true });
			throw error;
		}

		return {
			contentSha256: createHash('sha256').update(converted.bytes).digest('hex'),
			contentType: STORED_CONTENT_TYPE,
			originalName: normalizeOriginalName(input.originalName),
			sizeBytes: converted.bytes.byteLength,
			storageKey
		};
	};

	return {
		delete: async (storageKey) => rm(resolveStoragePath(storageKey), { force: true }),
		read: async (storageKey) => readFile(resolveStoragePath(storageKey)),
		save
	};
}
