import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
	convertReceiptImageToJpeg,
	normalizeReceiptImageForModel
} from '@/modules/receipt-import/receipt-image-normalizer';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const SAMPLE_HEIC_PATH = fileURLToPath(new URL('./fixtures/sample.heic', import.meta.url));

describe('convertReceiptImageToJpeg', () => {
	it('converts a PNG upload to a JPEG', async () => {
		const png = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 64, width: 64 }
		}).png().toBuffer();

		const converted = await convertReceiptImageToJpeg(new Uint8Array(png), 'image/png');

		expect(converted.contentType).toBe('image/jpeg');
		expect(converted.bytes[0]).toBe(0xff);
		expect(converted.bytes[1]).toBe(0xd8);
	});

	it('converts a JPEG upload to a re-encoded JPEG', async () => {
		const jpeg = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 64, width: 64 }
		}).jpeg().toBuffer();

		const converted = await convertReceiptImageToJpeg(new Uint8Array(jpeg), 'image/jpeg');

		expect(converted.contentType).toBe('image/jpeg');
		expect(converted.bytes[0]).toBe(0xff);
		expect(converted.bytes[1]).toBe(0xd8);
	});

	it('converts a real HEIC upload (the format the bundled sharp/libvips build cannot decode on its own) to a JPEG', async () => {
		const heic = await readFile(SAMPLE_HEIC_PATH);

		const converted = await convertReceiptImageToJpeg(new Uint8Array(heic), 'image/heic');

		expect(converted.contentType).toBe('image/jpeg');
		expect(converted.bytes[0]).toBe(0xff);
		expect(converted.bytes[1]).toBe(0xd8);

		// The fixture is a solid red 64x64 square (see scripts/generate note in
		// the fixture's provenance) -- decode the result and confirm the pixel
		// data actually round-tripped, not just that some JPEG bytes came back.
		const { data, info } = await sharp(Buffer.from(converted.bytes))
			.raw()
			.toBuffer({ resolveWithObject: true });

		expect(info.width).toBeGreaterThan(0);
		expect(info.height).toBeGreaterThan(0);
		// Center pixel should be strongly red, weakly green/blue -- allow for
		// HEIC's own lossy coding plus our re-encode, not an exact match.
		const centerOffset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;

		expect(data[centerOffset]).toBeGreaterThan(150);
		expect(data[centerOffset + 1]).toBeLessThan(100);
		expect(data[centerOffset + 2]).toBeLessThan(100);
	});
});

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
