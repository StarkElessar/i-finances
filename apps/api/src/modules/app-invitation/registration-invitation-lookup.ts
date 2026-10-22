import type { AppDatabase } from '@/infrastructure/database/client';

import type { InvitationKind } from '@i-finances/contracts';

import { findActiveInvitationKind } from './find-active-invitation-kind';

/**
 * Outside the sign-up transaction: whether an invitation token hash would let its holder sign up now. `start` uses
 * it to decide whether to bind the hash to the request, the bot to say «Готово» rather than «аккаунт не найден». Both
 * are hints only: `complete` decides again inside the transaction that creates the user.
 */
export class RegistrationInvitationLookup {
	public constructor(private readonly database: AppDatabase) {}

	public async findActiveKind(tokenHash: string, now: Date): Promise<InvitationKind | undefined> {
		return findActiveInvitationKind(this.database, tokenHash, now);
	}
}
