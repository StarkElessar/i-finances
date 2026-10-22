import type { HouseholdInvitationUnavailableReason } from '@i-finances/contracts';

/**
 * Why an invitation found by its hash is not active at `now` (an invitation into a household or into the application:
 * the four reasons are the same, Р5). An accepted one is `used`, a revoked one `revoked`; both win over `expired`,
 * which is what is left. An invitation cannot be both accepted and revoked: each statement needs it active.
 * `undefined` means the invitation is active.
 */
export function invitationUnavailableReason(
	invitation: { acceptedAt: Date | null; expiresAt: Date; revokedAt: Date | null },
	now: Date
): HouseholdInvitationUnavailableReason | undefined {
	if (invitation.acceptedAt !== null) {
		return 'used';
	}

	if (invitation.revokedAt !== null) {
		return 'revoked';
	}

	return invitation.expiresAt.getTime() > now.getTime() ? undefined : 'expired';
}
