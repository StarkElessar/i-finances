const ARGON2_HASH_PATTERN = /^\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

/**
 * Tells whether a stored password hash can actually be used to sign in.
 *
 * `users.password_hash` is NULL for accounts without a password of their own
 * (Telegram sign-up). Only a real Argon2 hash counts as a password: when it is
 * absent, passkeys and Telegram are the only ways into the account and the last
 * passkey must never be removed. Legacy non-Argon2 values (placeholders written
 * while the column was NOT NULL) are treated the same as NULL.
 *
 * The check is strict (the whole PHC shape: variant, version, cost parameters, salt, hash) because the
 * Argon2 verifier throws on anything that is not a PHC string. It is a type guard, so callers that pass
 * the check can hand the hash to the verifier without a cast.
 */
export function hasUsablePassword(passwordHash: string | null | undefined): passwordHash is string {
	return typeof passwordHash === 'string' && ARGON2_HASH_PATTERN.test(passwordHash);
}
