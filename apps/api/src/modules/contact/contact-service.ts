import { randomUUID } from 'node:crypto';

import type { HouseholdResolver } from '@/modules/household';

import {
	type ChangeContactArchiveStateInput,
	type ContactCollection,
	type ContactListStatus,
	type CreateContactInput,
	normalizeContactIdentity,
	normalizeContactLegalName,
	normalizeContactName,
	type PersistedContact,
	type UpdateContactInput
} from '@i-finances/contracts';

import { ContactNameConflictError, ContactVersionConflictError } from './contact-errors';
import { toPersistedContact } from './contact-mappers';
import type { ContactRepository } from './contact-repository';
import { ContactRules } from './contact-rules';

export type ContactServiceDependencies = {
	contactRepository: ContactRepository;
	householdResolver: HouseholdResolver;
	createId?: () => string;
	now?: () => Date;
};

export class ContactService {
	private readonly createId: () => string;
	private readonly now: () => Date;
	private readonly rules: ContactRules;

	public constructor(private readonly dependencies: ContactServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
		this.rules = new ContactRules(
			dependencies.contactRepository,
			dependencies.householdResolver
		);
	}

	public async list(userId: string, status: ContactListStatus): Promise<ContactCollection> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const records = await this.dependencies.contactRepository.list(household.id, status);

		return {
			baseCurrency: household.baseCurrency,
			items: records.map(toPersistedContact)
		};
	}

	public async create(userId: string, input: CreateContactInput): Promise<PersistedContact> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const name = normalizeContactName(input.name);
		const legalName = input.type === 'company'
			? normalizeContactLegalName(input.legalName)
			: null;
		const timestamp = this.now();

		await this.rules.assertNameAvailable(household.id, name);

		const record = await this.dependencies.contactRepository.insert({
			archivedAt: null,
			color: input.color,
			createdAt: timestamp,
			createdByUserId: userId,
			householdId: household.id,
			id: this.createId(),
			legalName,
			phone: input.phone,
			name,
			normalizedLegalName: legalName === null ? null : normalizeContactIdentity(legalName),
			normalizedName: normalizeContactIdentity(name),
			type: input.type,
			updatedAt: timestamp,
			version: 1
		});

		if (record === undefined) {
			throw new ContactNameConflictError();
		}

		return toPersistedContact(record);
	}

	public async update(userId: string, input: UpdateContactInput): Promise<PersistedContact> {
		const current = await this.rules.requireCurrent(userId, input.id);
		const name = normalizeContactName(input.name);
		const legalName = input.type === 'company'
			? normalizeContactLegalName(input.legalName)
			: null;

		this.rules.assertVersion(current.record, input.version);
		await this.rules.assertNameAvailable(current.householdId, name, input.id);

		const updated = await this.dependencies.contactRepository.update(
			current.householdId,
			input.id,
			input.version,
			{
				color: input.color,
				legalName,
				name,
				normalizedLegalName: legalName === null ? null : normalizeContactIdentity(legalName),
				normalizedName: normalizeContactIdentity(name),
				phone: input.phone,
				type: input.type,
				updatedAt: this.now()
			}
		);

		if (updated === undefined) {
			throw new ContactVersionConflictError();
		}

		return toPersistedContact(updated);
	}

	public archive(
		userId: string,
		input: ChangeContactArchiveStateInput
	): Promise<PersistedContact> {
		return this.changeArchiveState(userId, input, true);
	}

	public restore(
		userId: string,
		input: ChangeContactArchiveStateInput
	): Promise<PersistedContact> {
		return this.changeArchiveState(userId, input, false);
	}

	private async changeArchiveState(
		userId: string,
		input: ChangeContactArchiveStateInput,
		targetArchived: boolean
	): Promise<PersistedContact> {
		const current = await this.rules.requireCurrent(userId, input.id);

		this.rules.assertVersion(current.record, input.version);

		const currentlyArchived = current.record.archivedAt !== null;

		if (currentlyArchived === targetArchived) {
			return toPersistedContact(current.record);
		}

		const timestamp = this.now();
		const updated = await this.dependencies.contactRepository.setArchivedAt(
			current.householdId,
			input.id,
			input.version,
			targetArchived ? timestamp : null,
			timestamp
		);

		if (updated === undefined) {
			throw new ContactVersionConflictError();
		}

		return toPersistedContact(updated);
	}
}
