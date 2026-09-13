import {
	mkdtemp,
	readFile,
	rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReceiptImageStorage } from '@/modules/receipt-import/receipt-image-storage';
import {
	ReceiptImageValidationError
} from '@/modules/receipt-import/receipt-import-errors';

import sharp from 'sharp';
import {
	afterEach,
	describe,
	expect,
	it
} from 'vitest';

const SAMPLE_HEIC_PATH = fileURLToPath(new URL('./fixtures/sample.heic', import.meta.url));

async function createSampleJpeg(): Promise<Uint8Array> {
	const buffer = await sharp({
		create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 32, width: 32 }
	}).jpeg().toBuffer();

	return new Uint8Array(buffer);
}

let temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryDirectories.map(
		(directory) => rm(directory, { force: true, recursive: true })
	));
	temporaryDirectories = [];
});

async function createTemporaryRoot(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'receipt-storage-'));

	temporaryDirectories.push(directory);

	return directory;
}

describe('receipt image storage', () => {
	it('writes, reads and deletes an image by an opaque storage key, re-encoded as JPEG', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });
		const jpeg = await createSampleJpeg();
		const stored = await storage.save({
			bytes: jpeg,
			contentType: 'image/jpeg',
			originalName: '../../unsafe-name.jpg',
			receiptImportId: 'receipt-1'
		});

		expect(stored).toMatchObject({
			contentType: 'image/jpeg',
			originalName: 'unsafe-name.jpg',
			storageKey: 'receipt-1.jpg'
		});

		const persisted = await storage.read(stored.storageKey);

		expect(persisted[0]).toBe(0xff);
		expect(persisted[1]).toBe(0xd8);

		await storage.delete(stored.storageKey);
		await expect(storage.read(stored.storageKey)).rejects.toThrow();
	});

	it('converts a PNG upload to a stored JPEG', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });
		const png = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 32, width: 32 }
		}).png().toBuffer();
		const stored = await storage.save({
			bytes: new Uint8Array(png),
			contentType: 'image/png',
			originalName: 'receipt.png',
			receiptImportId: 'receipt-1'
		});

		expect(stored.contentType).toBe('image/jpeg');
		expect(stored.storageKey).toBe('receipt-1.jpg');

		const persisted = await storage.read(stored.storageKey);

		expect(persisted[0]).toBe(0xff);
		expect(persisted[1]).toBe(0xd8);
	});

	it('converts a real HEIC upload to a stored JPEG instead of rejecting it', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });
		const heic = await readFile(SAMPLE_HEIC_PATH);
		const stored = await storage.save({
			bytes: new Uint8Array(heic),
			contentType: 'image/heic',
			originalName: 'receipt.heic',
			receiptImportId: 'receipt-1'
		});

		expect(stored.contentType).toBe('image/jpeg');
		expect(stored.storageKey).toBe('receipt-1.jpg');

		const persisted = await storage.read(stored.storageKey);

		expect(persisted[0]).toBe(0xff);
		expect(persisted[1]).toBe(0xd8);
	});

	it('rejects unsupported content types before writing a file', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });

		await expect(storage.save({
			bytes: new Uint8Array([1]),
			contentType: 'application/pdf',
			originalName: 'receipt.pdf',
			receiptImportId: 'receipt-1'
		})).rejects.toBeInstanceOf(ReceiptImageValidationError);
	});

	it('rejects a file it cannot decode as an image with a clear message', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });

		await expect(storage.save({
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg',
			receiptImportId: 'receipt-1'
		})).rejects.toThrow('Не удалось прочитать изображение. Проверьте файл и попробуйте снова.');
	});

	it('rejects traversal when reading a storage key', async () => {
		const rootDirectory = await createTemporaryRoot();
		const storage = createReceiptImageStorage({ rootDirectory });

		await expect(storage.read('../secret.jpg'))
			.rejects.toBeInstanceOf(ReceiptImageValidationError);
	});
});
