import { normalizeContactIdentity } from '~/entities/contact/model/normalization';

import type { ContactRecord } from '~/server/db/schema';
import type { HouseholdResolver } from '~/server/household/household-service';

import {
	ContactNameConflictError,
	ContactNotFoundError,
	ContactVersionConflictError
} from './contact-errors';
import type { ContactRepository } from './contact-repository';

export type CurrentContact = {
	householdId: string;
	record: ContactRecord;
};

export type ContactRules = {
	assertNameAvailable: (
		householdId: string,
		name: string,
		currentContactId?: string
	) => Promise<void>;
	assertVersion: (
		record: ContactRecord,
		expectedVersion: number
	) => void;
	requireCurrent: (
		userId: string,
		contactId: string
	) => Promise<CurrentContact>;
};

/**
 * Centralizes contact invariants shared by application use cases.
 */
export function createContactRules(
	repository: ContactRepository,
	householdResolver: HouseholdResolver
): ContactRules {
	const requireCurrent = async (
		userId: string,
		contactId: string
	): Promise<CurrentContact> => {
		const household = await householdResolver.requireForUser(userId);
		const record = await repository.findById(household.id, contactId);

		if (record === undefined) {
			throw new ContactNotFoundError();
		}

		return {
			householdId: household.id,
			record
		};
	};

	const assertVersion = (
		record: ContactRecord,
		expectedVersion: number
	): void => {
		if (record.version !== expectedVersion) {
			throw new ContactVersionConflictError();
		}
	};

	const assertNameAvailable = async (
		householdId: string,
		name: string,
		currentContactId?: string
	): Promise<void> => {
		const existingContactId = await repository.findIdByNormalizedName(
			householdId,
			normalizeContactIdentity(name)
		);

		if (
			existingContactId === undefined
			|| existingContactId === currentContactId
		) {
			return;
		}

		throw new ContactNameConflictError();
	};

	return {
		assertNameAvailable,
		assertVersion,
		requireCurrent
	};
}
