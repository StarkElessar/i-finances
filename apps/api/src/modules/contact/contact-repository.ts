import type { AppDatabase } from '@/infrastructure/database/client';
import { contacts } from '@/infrastructure/database/schema';

import type { ContactListStatus, ContactType } from '@i-finances/contracts';
import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	sql
} from 'drizzle-orm';

export type ContactRecord = {
	archivedAt: Date | null;
	color: string;
	createdAt: Date;
	createdByUserId: string;
	householdId: string;
	id: string;
	legalName: string | null;
	name: string;
	normalizedLegalName: string | null;
	normalizedName: string;
	phone: string | null;
	type: ContactType;
	updatedAt: Date;
	version: number;
};

export type NewContactRecord = Omit<ContactRecord, 'version'> & {
	version?: number;
};

export type ContactUpdateValues = {
	color: string;
	legalName: string | null;
	name: string;
	normalizedLegalName: string | null;
	normalizedName: string;
	phone: string | null;
	type: ContactType;
	updatedAt: Date;
};

function toContactRecord(record: typeof contacts.$inferSelect): ContactRecord {
	return {
		archivedAt: record.archivedAt,
		color: record.color,
		createdAt: record.createdAt,
		createdByUserId: record.createdByUserId,
		householdId: record.householdId,
		id: record.id,
		legalName: record.legalName,
		name: record.name,
		normalizedLegalName: record.normalizedLegalName,
		normalizedName: record.normalizedName,
		phone: record.phone,
		type: record.type,
		updatedAt: record.updatedAt,
		version: record.version
	};
}

export class ContactRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async list(
		householdId: string,
		status: ContactListStatus
	): Promise<ContactRecord[]> {
		const householdCondition = eq(contacts.householdId, householdId);
		const archiveCondition = status === 'active'
			? isNull(contacts.archivedAt)
			: isNotNull(contacts.archivedAt);
		const where = status === 'all'
			? householdCondition
			: and(householdCondition, archiveCondition);
		const records = await this.database.select()
			.from(contacts)
			.where(where)
			.orderBy(asc(contacts.normalizedName), asc(contacts.id));

		return records.map(toContactRecord);
	}

	public async findById(
		householdId: string,
		contactId: string
	): Promise<ContactRecord | undefined> {
		const record = this.database.select()
			.from(contacts)
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.id, contactId)
			))
			.limit(1)
			.get();

		return record === undefined ? undefined : toContactRecord(record);
	}

	public async findIdByNormalizedName(
		householdId: string,
		normalizedName: string
	): Promise<string | undefined> {
		const record = this.database.select({ id: contacts.id })
			.from(contacts)
			.where(and(
				eq(contacts.householdId, householdId),
				eq(contacts.normalizedName, normalizedName)
			))
			.limit(1)
			.get();

		return record?.id;
	}

	public async insert(record: NewContactRecord): Promise<ContactRecord | undefined> {
		const inserted = this.database.insert(contacts)
			.values(record)
			.onConflictDoNothing()
			.returning()
			.get() as typeof contacts.$inferSelect | undefined;

		return inserted === undefined ? undefined : toContactRecord(inserted);
	}

	public async update(
		householdId: string,
		contactId: string,
		expectedVersion: number,
		values: ContactUpdateValues
	): Promise<ContactRecord | undefined> {
		const updated = this.database.update(contacts)
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
			.get() as typeof contacts.$inferSelect | undefined;

		return updated === undefined ? undefined : toContactRecord(updated);
	}

	public async setArchivedAt(
		householdId: string,
		contactId: string,
		expectedVersion: number,
		archivedAt: Date | null,
		updatedAt: Date
	): Promise<ContactRecord | undefined> {
		const updated = this.database.update(contacts)
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
			.get() as typeof contacts.$inferSelect | undefined;

		return updated === undefined ? undefined : toContactRecord(updated);
	}
}
