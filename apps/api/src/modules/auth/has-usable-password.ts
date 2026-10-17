const ARGON2_HASH_PATTERN = /^\$argon2(?:id|i|d)\$/;

/**
 * Tells whether a stored value can be handed to the Argon2 verifier. Anything else (no password, a placeholder for
 * accounts that sign in another way, a corrupted value) must be treated as "no password set": the verifier throws on
 * input that is not a PHC-formatted Argon2 hash.
 */
export function hasUsablePassword(passwordHash: string | null | undefined): passwordHash is string {
	return typeof passwordHash === 'string' && ARGON2_HASH_PATTERN.test(passwordHash);
}
