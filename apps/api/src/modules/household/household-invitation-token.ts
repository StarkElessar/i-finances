import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** The secret of an invitation link: 32 bytes from the CSPRNG, 43 base64url characters (Р5). Never stored. */
export function generateHouseholdInvitationToken(): string {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Only this SHA-256 hex lands in `household_invitations.token_hash`, and only it is ever passed to a query: a leaked
 * database (or a logged query) does not open any household. A plain hash is enough, the token has 256 random bits.
 */
export function hashHouseholdInvitationToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}
