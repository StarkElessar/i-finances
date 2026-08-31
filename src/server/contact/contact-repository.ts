import type { ContactListStatus } from '~/entities/contact/api/contact.contract';

import { type AppDatabase, db } from '~/server/db/client';
import type {
	ContactRecord,
	NewContactRecord
} from '~/server/db/schema';
import { contacts } from '~/server/db/schema';

import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	sql
} from 'drizzle-orm';

export type ContactUpdateValues = {
	color: string;
	legalName: string | null;
	name: string;
	normalizedLegalName: string | null;
	normalizedName: string;
	phone: string | null;
	type: ContactRecord['type'];
	updatedAt: Date;
};

export type ContactRepository = {
	findById: (
		householdId: string,
		contactId: string
	) => Promise<ContactRecord | undefined>;
	findIdByNormalizedName: (
		householdId: string,
		normalizedName: string
	) => Promise<string | undefined>;
	insert: (
		record: NewContactRecord
	) => Promise<ContactRecord | undefined>;
	list: (
		householdId: string,
		status: ContactListStatus
	) => Promise<ContactRecord[]>;
	setArchivedAt: (
		householdId: string,
		contactId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	) => Promise<ContactRecord | undefined>;
	update: (
		householdId: string,
		contactId: string,
		expectedVersion: number,
		values: ContactUpdateValues
	) => Promise<ContactRecord | undefined>;
};

/**
 * Creates a repository whose every read and write is scoped by household.
 */
export function createContactRepository(
	database: AppDatabase = db
): ContactRepository {
	const list = async (
		householdId: string,
		status: ContactListStatus
	): Promise<ContactRecord[]> => {
		const householdCondition = eq(contacts.householdId, householdId);
		const archiveCondition = status === 'active'
			? isNull(contacts.archivedAt)
			: isNotNull(contacts.archivedAt);
		const where = status === 'all'
			? householdCondition
			: and(householdCondition, archiveCondition);

		return database.select()
			.from(contacts)
			.where(where)
			.orderBy(
				asc(contacts.normalizedName),
				asc(contacts.id)
			);
	};

	const findById = async (
		householdId: string,
		contactId: string
	): Promise<ContactRecord | undefined> => {
		return database.select()
			.from(contacts)
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.id, contactId)
			))
			.limit(1)
			.get();
	};

	const findIdByNormalizedName = async (
		householdId: string,
		normalizedName: string
	): Promise<string | undefined> => {
		const record = database.select({ id: contacts.id })
			.from(contacts)
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.normalizedName, normalizedName)
			))
			.limit(1)
			.get();

		return record?.id;
	};

	const insert = async (
		record: NewContactRecord
	): Promise<ContactRecord | undefined> => {
		return database.insert(contacts)
			.values(record)
			.onConflictDoNothing()
			.returning()
			.get();
	};

	const update = async (
		householdId: string,
		contactId: string,
		expectedVersion: number,
		values: ContactUpdateValues
	): Promise<ContactRecord | undefined> => {
		return database.update(contacts)
			.set({
				...values,
				version: sql`${contacts.version} + 1`
			})
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.id, contactId),
				eq(contacts.version, expectedVersion)
			))
			.returning()
			.get();
	};

	const setArchivedAt = async (
		householdId: string,
		contactId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<ContactRecord | undefined> => {
		return database.update(contacts)
			.set({
				archivedAt,
				updatedAt,
				version: sql`${contacts.version} + 1`
			})
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.id, contactId),
				eq(contacts.version, expectedVersion)
			))
			.returning()
			.get();
	};

	return {
		findById,
		findIdByNormalizedName,
		insert,
		list,
		setArchivedAt,
		update
	};
}
