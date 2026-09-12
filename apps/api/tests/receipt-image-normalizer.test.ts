import { normalizeReceiptImageForModel } from '@/modules/receipt-import/receipt-image-normalizer';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('normalizeReceiptImageForModel', () => {
	it('converts a PNG to a JPEG', async () => {
		const png = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 64, width: 64 }
		}).png().toBuffer();

		const normalized = await normalizeReceiptImageForModel(new Uint8Array(png));

		expect(normalized.contentType).toBe('image/jpeg');
		// JPEG files start with the SOI marker 0xFFD8.
		expect(normalized.bytes[0]).toBe(0xff);
		expect(normalized.bytes[1]).toBe(0xd8);
	});

	it('downsizes an oversized image to at most 2000px on the long edge', async () => {
		const large = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 3_000, width: 1_000 }
		}).png().toBuffer();

		const normalized = await normalizeReceiptImageForModel(new Uint8Array(large));
		const metadata = await sharp(Buffer.from(normalized.bytes)).metadata();

		expect(metadata.height).toBeLessThanOrEqual(2_000);
	});
});
