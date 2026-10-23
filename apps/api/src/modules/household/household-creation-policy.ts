import type { AppDatabase } from '@/infrastructure/database/client';
import type { PlatformAdminPolicy, SessionUser } from '@/modules/auth';

import { hasHouseholdCreationRight } from './has-household-creation-right';

/**
 * Who may found a household (owner's decision 2026-10-23, `app-invitations-v1.md`, section 13): a platform
 * administrator, a person who signed up with an invitation into the application, and anybody who is or ever was an
 * owner of a household (`hasHouseholdCreationRight`). A person who came with a household invitation never may, even
 * after leaving that household: otherwise every owner could let new people into the application.
 *
 * This answers `GET /api/auth/session` (`canCreateHousehold`) only. `POST /api/household` decides with the same rule
 * inside the transaction that creates the household (`HouseholdRepository.createWithOwner`).
 */
export class HouseholdCreationPolicy {
	public constructor(
		private readonly database: AppDatabase,
		private readonly platformAdmins: Pick<PlatformAdminPolicy, 'isPlatformAdmin'>
	) {}

	public canCreateHousehold(user: Pick<SessionUser, 'id' | 'username'>): boolean {
		return this.platformAdmins.isPlatformAdmin(user) || hasHouseholdCreationRight(this.database, user.id);
	}
}
