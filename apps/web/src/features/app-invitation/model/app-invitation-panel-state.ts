import type { AppInvitationListItem, CreatedAppInvitation } from '@i-finances/contracts';

export type AppInvitationPanelState = {
	load: 'loading' | 'ready' | 'failed' | 'forbidden';
	view: 'main' | 'create' | 'created';
	invitations: AppInvitationListItem[];
	expanded: boolean;
	note: string;
	noteError?: string;
	error?: string;
	created?: CreatedAppInvitation;
	confirmingId?: string;
	confirmError?: string;
	busy?: 'load' | 'create' | 'revoke';
	createRetryAt?: number;
	createRateLimitError?: string;
	limitReached?: boolean;
};
