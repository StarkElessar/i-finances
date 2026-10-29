import type { AppInvitationListItem } from '@i-finances/contracts';

export const ACCEPTED_APP_INVITATIONS_PREVIEW_COUNT = 5;

export function selectAppInvitations(invitations: AppInvitationListItem[], expanded: boolean) {
	const active = invitations.filter((invitation) => invitation.status === 'active');
	const accepted = invitations.filter((invitation) => invitation.status === 'accepted')
		.sort((left, right) => (right.acceptedAt ?? '').localeCompare(left.acceptedAt ?? ''));

	return {
		active,
		canExpand: accepted.length > ACCEPTED_APP_INVITATIONS_PREVIEW_COUNT,
		visibleAccepted: expanded ? accepted : accepted.slice(0, ACCEPTED_APP_INVITATIONS_PREVIEW_COUNT)
	};
}
