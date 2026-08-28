import type { AccountRepository } from '~/server/account/account-repository';
import type { CategoryRepository } from '~/server/category/category-repository';
import type { ContactRepository } from '~/server/contact/contact-repository';
import type { AccountRecord, OperationRecord } from '~/server/db/schema';

import {
	OperationAccountUnavailableError,
	OperationDeletedError,
	OperationNotFoundError,
	OperationReferenceUnavailableError,
	OperationTransferLinkedError,
	OperationVersionConflictError
} from './operation-errors';
import type { OperationRepository } from './operation-repository';

export type OperationReferenceSelection = {
	category: {
		id: string;
		name: string;
	} | null;
	contact: {
		id: string;
		name: string;
	} | null;
};

export type OperationRules = {
	assertEditable: (record: OperationRecord) => void;
	assertVersion: (record: OperationRecord, expectedVersion: number) => void;
	requireAccount: (
		householdId: string,
		accountId: string,
		activeOnly: boolean
	) => Promise<AccountRecord>;
	requireCurrent: (
		householdId: string,
		operationId: string
	) => Promise<OperationRecord>;
	resolveReferences: (
		householdId: string,
		categoryId: string | null,
		contactId: string | null,
		current?: OperationRecord
	) => Promise<OperationReferenceSelection>;
};

export type OperationRulesDependencies = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	contactRepository: ContactRepository;
	operationRepository: OperationRepository;
};

/**
 * Creates reusable household, archive and optimistic-lock operation rules.
 */
export function createOperationRules(
	dependencies: OperationRulesDependencies
): OperationRules {
	const requireAccount = async (
		householdId: string,
		accountId: string,
		activeOnly: boolean
	): Promise<AccountRecord> => {
		const account = await dependencies.accountRepository.findById(
			householdId,
			accountId
		);

		if (
			account !== undefined
			&& (!activeOnly || account.archivedAt === null)
		) {
			return account;
		}

		throw new OperationAccountUnavailableError();
	};

	const requireCurrent = async (
		householdId: string,
		operationId: string
	): Promise<OperationRecord> => {
		const operation = await dependencies.operationRepository.findById(
			householdId,
			operationId
		);

		if (operation !== undefined) {
			return operation;
		}

		throw new OperationNotFoundError();
	};

	const assertVersion = (
		record: OperationRecord,
		expectedVersion: number
	): void => {
		if (record.version !== expectedVersion) {
			throw new OperationVersionConflictError();
		}
	};

	const assertEditable = (record: OperationRecord): void => {
		if (record.deletedAt !== null) {
			throw new OperationDeletedError();
		}

		if (record.transferId !== null) {
			throw new OperationTransferLinkedError();
		}
	};

	const resolveReferences = async (
		householdId: string,
		categoryId: string | null,
		contactId: string | null,
		current?: OperationRecord
	): Promise<OperationReferenceSelection> => {
		const [category, contact] = await Promise.all([
			resolveCategory(
				dependencies.categoryRepository,
				householdId,
				categoryId,
				current?.categoryId
			),
			resolveContact(
				dependencies.contactRepository,
				householdId,
				contactId,
				current?.contactId
			)
		]);

		return {
			category,
			contact
		};
	};

	return {
		assertEditable,
		assertVersion,
		requireAccount,
		requireCurrent,
		resolveReferences
	};
}

async function resolveCategory(
	repository: CategoryRepository,
	householdId: string,
	categoryId: string | null,
	currentCategoryId?: string | null
): Promise<OperationReferenceSelection['category']> {
	if (categoryId === null) {
		return null;
	}

	const aggregate = await repository.findById(householdId, categoryId);
	const category = aggregate?.category;
	const keepsCurrentReference = categoryId === currentCategoryId;

	if (
		category !== undefined
		&& (category.archivedAt === null || keepsCurrentReference)
	) {
		return {
			id: category.id,
			name: category.name
		};
	}

	throw new OperationReferenceUnavailableError('categoryId');
}

async function resolveContact(
	repository: ContactRepository,
	householdId: string,
	contactId: string | null,
	currentContactId?: string | null
): Promise<OperationReferenceSelection['contact']> {
	if (contactId === null) {
		return null;
	}

	const contact = await repository.findById(householdId, contactId);
	const keepsCurrentReference = contactId === currentContactId;

	if (
		contact !== undefined
		&& (contact.archivedAt === null || keepsCurrentReference)
	) {
		return {
			id: contact.id,
			name: contact.name
		};
	}

	throw new OperationReferenceUnavailableError('contactId');
}
