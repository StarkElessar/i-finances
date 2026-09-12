import sharp from 'sharp';

const MAX_DIMENSION = 2_000;
const JPEG_QUALITY = 85;

export type NormalizedReceiptImage = {
	bytes: Uint8Array;
	contentType: 'image/jpeg';
};

export async function normalizeReceiptImageForModel(bytes: Uint8Array): Promise<NormalizedReceiptImage> {
	const buffer = await sharp(bytes)
		.rotate()
		.resize({ fit: 'inside', height: MAX_DIMENSION, width: MAX_DIMENSION, withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();

	return { bytes: new Uint8Array(buffer), contentType: 'image/jpeg' };
}
