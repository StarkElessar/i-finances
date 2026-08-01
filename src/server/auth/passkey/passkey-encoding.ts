import { Buffer } from 'node:buffer';

/**
 * Encodes binary WebAuthn data for SQLite text columns.
 */
export function uint8ArrayToBase64Url(value: Uint8Array): string {
	return Buffer.from(value).toString('base64url');
}

/**
 * Decodes binary WebAuthn data from SQLite text columns.
 */
export function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
	const bytes = Buffer.from(value, 'base64url');
	const arrayBuffer = new ArrayBuffer(bytes.byteLength);
	const view = new Uint8Array(arrayBuffer);

	view.set(bytes);

	return view;
}
