import type { HouseholdResolver } from '@/modules/household';

import { normalizeContactIdentity } from '@i-finances/contracts';

import {
	ContactNameConflictError,
	ContactNotFoundError,
	ContactVersionConflictError
} from './contact-errors';
import type { ContactRecord, ContactRepository } from './contact-repository';

export type CurrentContact = {
	householdId: string;
	record: ContactRecord;
};

export class ContactRules {
	public constructor(
		private readonly repository: ContactRepository,
		private readonly householdResolver: HouseholdResolver
	) {}

	public async assertNameAvailable(
		householdId: string,
		name: string,
		currentContactId?: string
	): Promise<void> {
		const existingContactId = await this.repository.findIdByNormalizedName(
			householdId,
			normalizeContactIdentity(name)
		);

		if (existingContactId === undefined || existingContactId === currentContactId) {
			return;
		}

		throw new ContactNameConflictError();
	}

	public assertVersion(record: ContactRecord, expectedVersion: number): void {
		if (record.version !== expectedVersion) {
			throw new ContactVersionConflictError();
		}
	}

	public async requireCurrent(userId: string, contactId: string): Promise<CurrentContact> {
		const household = await this.householdResolver.requireForUser(userId);
		const record = await this.repository.findById(household.id, contactId);

		if (record === undefined) {
			throw new ContactNotFoundError();
		}

		return { householdId: household.id, record };
	}
}
