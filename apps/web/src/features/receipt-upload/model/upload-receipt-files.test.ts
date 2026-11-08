import { ApiHttpError } from '@/shared/api';

import { describe, expect, it, vi } from 'vitest';

import { uploadReceiptFiles } from './upload-receipt-files';

function photo(name: string, type = 'image/jpeg'): File {
	return new File([new Uint8Array(10)], name, { type });
}

describe('uploadReceiptFiles', () => {
	it('sends the files one by one, in order, and reports progress', async () => {
		const order: string[] = [];
		const create = vi.fn(async (file: File) => {
			order.push(`start ${file.name}`);
			await Promise.resolve();
			order.push(`end ${file.name}`);

			return { receiptImport: { id: `id-${file.name}` } };
		});
		const progress: [number, number][] = [];

		const result = await uploadReceiptFiles([photo('a'), photo('b')], create, (current, total) => progress.push([current, total]));

		expect(result).toEqual({ failures: [], uploadedIds: ['id-a', 'id-b'] });
		expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
		expect(progress).toEqual([[1, 2], [2, 2]]);
	});

	it('skips an unsuitable file without calling the server and goes on with the rest', async () => {
		const create = vi.fn(async (file: File) => ({ receiptImport: { id: `id-${file.name}` } }));

		const result = await uploadReceiptFiles([photo('a'), photo('b.gif', 'image/gif'), photo('c')], create);

		expect(create).toHaveBeenCalledTimes(2);
		expect(result.uploadedIds).toEqual(['id-a', 'id-c']);
		expect(result.failures).toEqual([{ fileName: 'b.gif', reason: 'нужны JPEG, PNG или HEIC' }]);
	});

	it('records a server refusal with its message and keeps going', async () => {
		const create = vi.fn(async (file: File) => {
			if (file.name === 'a') {
				throw new ApiHttpError(422, { message: 'Не удалось прочитать изображение.', ok: false }, '/api/receipt-imports');
			}

			return { receiptImport: { id: `id-${file.name}` } };
		});

		const result = await uploadReceiptFiles([photo('a'), photo('b')], create);

		expect(result.uploadedIds).toEqual(['id-b']);
		expect(result.failures).toEqual([{ fileName: 'a', reason: 'Не удалось прочитать изображение' }]);
	});

	it('names a lost connection and an oversized request', async () => {
		const create = vi.fn()
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockRejectedValueOnce(new ApiHttpError(413, null, '/api/receipt-imports'))
			.mockRejectedValueOnce(new Error('boom'));

		const result = await uploadReceiptFiles([photo('a'), photo('b'), photo('c')], create);

		expect(result.failures.map((failure) => failure.reason)).toEqual([
			'нет соединения',
			'файл слишком большой',
			'не удалось отправить'
		]);
	});
});
