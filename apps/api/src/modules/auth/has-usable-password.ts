const ARGON2_HASH_PATTERN = /^\$argon2(?:id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

/**
 * Tells whether a stored password hash can actually be used to sign in.
 *
 * `users.password_hash` is NOT NULL, so accounts that have no password of their
 * own (future Telegram or passkey-only sign-up) must carry a placeholder that is
 * not an Argon2 PHC string. Only a real Argon2 hash counts as a password: when
 * it is absent, passkeys are the only way into the account and the last one
 * must never be removed.
 *
 * The check is strict (the whole PHC shape: variant, version, cost parameters, salt, hash) because the
 * Argon2 verifier throws on anything that is not a PHC string. Accepts nullable
 * input so it survives `users.password_hash` becoming NULL.
 */
export function hasUsablePassword(passwordHash: string | null | undefined): boolean {
	return typeof passwordHash === 'string' && ARGON2_HASH_PATTERN.test(passwordHash);
}
