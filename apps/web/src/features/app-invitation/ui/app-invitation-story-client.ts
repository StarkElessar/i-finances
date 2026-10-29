import type { AppInvitationListItem } from '@i-finances/contracts';

import type { AppInvitationGateway } from '../model/app-invitation-panel';

/** Disposable story data only; never reaches an API, storage, or browser history. */
export function createAppInvitationStoryClient(initial: AppInvitationListItem[]): AppInvitationGateway {
	let invitations = [...initial];
	let sequence = 0;

	return {
		create: async ({ note }) => {
			const id = `story-${++sequence}`;
			const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

			invitations = [{
				acceptedAt: null,
				acceptedBy: null,
				createdAt: new Date().toISOString(),
				expiresAt,
				id,
				note: note ?? null,
				status: 'active'
			}, ...invitations];

			return { invitation: { expiresAt, id, link: `https://ifinances.example/invite#${'x'.repeat(43)}` }, ok: true };
		},
		list: async () => ({ invitations: [...invitations], ok: true }),
		revoke: async (id) => {
			invitations = invitations.filter((invitation) => invitation.id !== id);
			return { ok: true };
		}
	};
}
