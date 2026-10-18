import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
	return createHash('sha256').update(value).digest();
}

/**
 * Compares two secrets in constant time. Both sides are hashed first, so the comparison is over equal-length buffers
 * and the length of the expected secret is not revealed by an early return.
 */
export function constantTimeEquals(expected: string, provided: string): boolean {
	return timingSafeEqual(digest(expected), digest(provided));
}
