import convertHeic from 'heic-convert';
import sharp from 'sharp';

const MAX_DIMENSION = 2_000;
const JPEG_QUALITY = 85;
const STORAGE_JPEG_QUALITY = 92;

export type NormalizedReceiptImage = {
	bytes: Uint8Array;
	contentType: 'image/jpeg';
};

function isHeicContentType(contentType: string): boolean {
	return contentType === 'image/heic' || contentType === 'image/heif';
}

/**
 * Converts any accepted upload format (JPEG, PNG, HEIC/HEIF) to a single
 * JPEG stored on disk. The bundled sharp/libvips build has no HEVC decoder,
 * so HEIC goes through `heic-convert` (a pure-JS decoder) first; everything
 * else, including the HEIC output, is then re-encoded through the same
 * sharp pipeline so the stored file is always a consistent, EXIF-rotated
 * JPEG regardless of what was uploaded.
 */
export async function convertReceiptImageToJpeg(
	bytes: Uint8Array,
	contentType: string
): Promise<NormalizedReceiptImage> {
	const decodableBytes = isHeicContentType(contentType)
		? await convertHeic({ buffer: bytes, format: 'PNG' })
		: bytes;

	const buffer = await sharp(decodableBytes)
		.rotate()
		.jpeg({ quality: STORAGE_JPEG_QUALITY })
		.toBuffer();

	return { bytes: new Uint8Array(buffer), contentType: 'image/jpeg' };
}

export async function normalizeReceiptImageForModel(bytes: Uint8Array): Promise<NormalizedReceiptImage> {
	const buffer = await sharp(bytes)
		.rotate()
		.resize({ fit: 'inside', height: MAX_DIMENSION, width: MAX_DIMENSION, withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();

	return { bytes: new Uint8Array(buffer), contentType: 'image/jpeg' };
}
