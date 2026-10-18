import * as nodeCrypto from 'node:crypto';

import { constantTimeEquals } from '@/http/constant-time-equals';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
	const actual = await importOriginal<typeof nodeCrypto>();

	return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

describe('constantTimeEquals', () => {
	afterEach(() => {
		vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
	});

	it('is true only for the same string', () => {
		expect(constantTimeEquals('secret-value', 'secret-value')).toBe(true);
		expect(constantTimeEquals('secret-value', 'secret-valuf')).toBe(false);
		expect(constantTimeEquals('secret-value', 'secret-valu')).toBe(false);
		expect(constantTimeEquals('secret-value', '')).toBe(false);
	});

	it.each([
		['the same length', 'b'.repeat(40)],
		['a shorter value', 'x'],
		['an empty value', ''],
		['a longer value', 'b'.repeat(400)]
	])('compares %s through timingSafeEqual over two 32-byte digests, without an early return', (_name, provided) => {
		constantTimeEquals('a'.repeat(40), provided);

		expect(nodeCrypto.timingSafeEqual).toHaveBeenCalledTimes(1);

		const [left, right] = vi.mocked(nodeCrypto.timingSafeEqual).mock.calls[0] ?? [];

		expect(Buffer.isBuffer(left) && left.length).toBe(32);
		expect(Buffer.isBuffer(right) && right.length).toBe(32);
	});
});
