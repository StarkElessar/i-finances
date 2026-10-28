import type { AppInvitationListItem } from '@i-finances/contracts';

/** Board copy deliberately has no gendered verb and no repeated administrator note. */
export function formatAppInvitationAcceptance(invitation: AppInvitationListItem): string {
	const login = invitation.acceptedBy?.telegramUsername ? `@${invitation.acceptedBy.telegramUsername}` : 'без @логина';
	const acceptedAt = new Date(invitation.acceptedAt ?? '');
	const date = Number.isNaN(acceptedAt.getTime())
		? '…' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(acceptedAt);

	return `${login} · принято ${date}`;
}
