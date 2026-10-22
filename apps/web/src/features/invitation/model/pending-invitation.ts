import { getSessionStorage } from '@/shared/lib';

import { PendingInvitationStore } from './pending-invitation-store';

/** The one store of the page: the invitation page, the onboarding and the sign-in redirect all see the same token. */
export const pendingInvitation = new PendingInvitationStore(getSessionStorage());
