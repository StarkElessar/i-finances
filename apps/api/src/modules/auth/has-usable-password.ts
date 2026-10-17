/**
 * Tells whether a stored password hash can actually be used to sign in.
 *
 * `users.password_hash` is NOT NULL, so accounts that have no password of their
 * own (future Telegram or passkey-only sign-up) must carry a placeholder that is
 * not an Argon2 PHC string. Only a real Argon2 hash counts as a password: when
 * it is absent, passkeys are the only way into the account and the last one
 * must never be removed.
 */
export function hasUsablePassword(passwordHash: string): boolean {
	return passwordHash.startsWith('$argon2');
}
