import type { AccountRecord, AccountRepository } from '@/modules/account';
import type { CategoryRepository } from '@/modules/category';
import type { ContactRepository } from '@/modules/contact';
import type { HouseholdResolver } from '@/modules/household';

import {
	OperationAccountUnavailableError,
	OperationDeletedError,
	OperationNotFoundError,
	OperationReferenceUnavailableError,
	OperationTransferLinkedError,
	OperationVersionConflictError
} from './operation-errors';
import type { OperationRecord, OperationRepository } from './operation-repository';

export type OperationReferenceSelection = {
	category: { id: string; name: string } | null;
	contact: { id: string; name: string } | null;
};

export type CurrentOperation = {
	householdId: string;
	record: OperationRecord;
};

export class OperationRules {
	public constructor(
		private readonly accountRepository: AccountRepository,
		private readonly categoryRepository: CategoryRepository,
		private readonly contactRepository: Pick<ContactRepository, 'findById'>,
		private readonly operationRepository: OperationRepository,
		private readonly householdResolver: HouseholdResolver
	) {}

	public async requireCurrent(userId: string, operationId: string): Promise<CurrentOperation> {
		const household = await this.householdResolver.requireForUser(userId);
		const record = await this.operationRepository.findById(household.id, operationId);

		if (record === undefined) {
			throw new OperationNotFoundError();
		}

		return { householdId: household.id, record };
	}

	public async requireAccount(
		householdId: string,
		accountId: string,
		activeOnly: boolean
	): Promise<AccountRecord> {
		const account = await this.accountRepository.findById(householdId, accountId);

		if (account !== undefined && (!activeOnly || account.archivedAt === null)) {
			return account;
		}

		throw new OperationAccountUnavailableError();
	}

	public assertVersion(record: OperationRecord, expectedVersion: number): void {
		if (record.version !== expectedVersion) {
			throw new OperationVersionConflictError();
		}
	}

	public assertEditable(record: OperationRecord): void {
		if (record.deletedAt !== null) {
			throw new OperationDeletedError();
		}

		if (record.transferId !== null) {
			throw new OperationTransferLinkedError();
		}
	}

	public async resolveReferences(
		householdId: string,
		categoryId: string | null,
		contactId: string | null,
		current?: OperationRecord
	): Promise<OperationReferenceSelection> {
		const [category, contact] = await Promise.all([
			this.resolveCategory(householdId, categoryId, current?.categoryId),
			this.resolveContact(householdId, contactId, current?.contactId)
		]);

		return { category, contact };
	}

	private async resolveCategory(
		householdId: string,
		categoryId: string | null,
		currentCategoryId: string | null | undefined
	): Promise<OperationReferenceSelection['category']> {
		if (categoryId === null) {
			return null;
		}

		const aggregate = await this.categoryRepository.findById(householdId, categoryId);
		const category = aggregate?.category;
		const keepsCurrentReference = categoryId === currentCategoryId;

		if (category !== undefined && (category.archivedAt === null || keepsCurrentReference)) {
			return { id: category.id, name: category.name };
		}

		throw new OperationReferenceUnavailableError('categoryId');
	}

	private async resolveContact(
		householdId: string,
		contactId: string | null,
		currentContactId: string | null | undefined
	): Promise<OperationReferenceSelection['contact']> {
		if (contactId === null) {
			return null;
		}

		const contact = await this.contactRepository.findById(householdId, contactId);
		const keepsCurrentReference = contactId === currentContactId;

		if (contact !== undefined && (contact.archivedAt === null || keepsCurrentReference)) {
			return { id: contact.id, name: contact.name };
		}

		throw new OperationReferenceUnavailableError('contactId');
	}
}
