import {
	base64UrlToUint8Array,
	uint8ArrayToBase64Url
} from '@/modules/auth/passkey-encoding';

import { describe, expect, it } from 'vitest';

describe('passkey encoding', () => {
	it('round-trips WebAuthn binary data through base64url text', () => {
		const source = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
		const encoded = uint8ArrayToBase64Url(source);
		const decoded = base64UrlToUint8Array(encoded);

		expect(encoded).not.toContain('+');
		expect(encoded).not.toContain('/');
		expect(encoded).not.toContain('=');
		expect([...decoded]).toEqual([...source]);
	});
});
