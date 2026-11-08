import { describe, expect, it } from 'vitest';

import { RECEIPT_IMAGE_MAX_BYTES, validateReceiptFile } from './receipt-file-rules';

function makeFile(name: string, type: string, size = 10): File {
	return new File([new Uint8Array(size)], name, { type });
}

describe('validateReceiptFile', () => {
	it.each(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])('accepts %s', (type) => {
		expect(validateReceiptFile(makeFile('check', type))).toBeUndefined();
	});

	it('takes a photo without a MIME type by its extension (some phones send HEIC that way)', () => {
		expect(validateReceiptFile(makeFile('IMG_0001.HEIC', ''))).toBeUndefined();
		expect(validateReceiptFile(makeFile('notes.pdf', ''))).toBe('нужны JPEG, PNG или HEIC');
	});

	it('rejects other formats, empty files and files over 15 MB', () => {
		expect(validateReceiptFile(makeFile('check.gif', 'image/gif'))).toBe('нужны JPEG, PNG или HEIC');
		expect(validateReceiptFile(makeFile('check.jpg', 'image/jpeg', 0))).toBe('файл пустой');
		expect(validateReceiptFile(makeFile('check.jpg', 'image/jpeg', RECEIPT_IMAGE_MAX_BYTES + 1))).toBe('файл больше 15 МБ');
		expect(validateReceiptFile(makeFile('check.jpg', 'image/jpeg', RECEIPT_IMAGE_MAX_BYTES))).toBeUndefined();
	});
});
