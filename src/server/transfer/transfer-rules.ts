import type { AccountRepository } from '~/server/account/account-repository';
import type { ContactRepository } from '~/server/contact/contact-repository';
import type { AccountRecord, TransferRecord } from '~/server/db/schema';

import {
	TransferAccountsInvalidError,
	TransferAccountUnavailableError,
	TransferDeletedError,
	TransferNotFoundError,
	TransferReferenceUnavailableError,
	TransferVersionConflictError
} from './transfer-errors';
import type { TransferRepository, TransferWithLegs } from './transfer-repository';

export type TransferContactSelection = {
	id: string;
	name: string;
} | null;

export type TransferRules = {
	assertEditable: (record: TransferRecord) => void;
	assertVersion: (record: TransferRecord, expectedVersion: number) => void;
	requireAccounts: (
		householdId: string,
		fromAccountId: string,
		toAccountId: string
	) => Promise<{
		fromAccount: AccountRecord;
		toAccount: AccountRecord;
	}>;
	requireCurrent: (
		householdId: string,
		transferId: string
	) => Promise<TransferWithLegs>;
	resolveContact: (
		householdId: string,
		contactId: string | null,
		current?: TransferRecord
	) => Promise<TransferContactSelection>;
};

export type TransferRulesDependencies = {
	accountRepository: AccountRepository;
	contactRepository: ContactRepository;
	transferRepository: TransferRepository;
};

/**
 * Creates reusable household, archive and optimistic-lock transfer rules.
 */
export function createTransferRules(
	dependencies: TransferRulesDependencies
): TransferRules {
	const requireAccounts = async (
		householdId: string,
		fromAccountId: string,
		toAccountId: string
	) => {
		if (fromAccountId === toAccountId) {
			throw new TransferAccountsInvalidError(
				'toAccountId',
				'Выберите разные счета для перевода.'
			);
		}

		const [fromAccount, toAccount] = await Promise.all([
			dependencies.accountRepository.findById(householdId, fromAccountId),
			dependencies.accountRepository.findById(householdId, toAccountId)
		]);

		if (fromAccount === undefined || fromAccount.archivedAt !== null) {
			throw new TransferAccountUnavailableError();
		}

		if (toAccount === undefined || toAccount.archivedAt !== null) {
			throw new TransferAccountUnavailableError();
		}

		if (fromAccount.currency === toAccount.currency) {
			throw new TransferAccountsInvalidError(
				'toAccountId',
				'В первой версии перевод доступен только между разными валютами.'
			);
		}

		return {
			fromAccount,
			toAccount
		};
	};

	const requireCurrent = async (
		householdId: string,
		transferId: string
	): Promise<TransferWithLegs> => {
		const current = await dependencies.transferRepository.findById(
			householdId,
			transferId
		);

		if (current === undefined) {
			throw new TransferNotFoundError();
		}

		return current;
	};

	const assertVersion = (
		record: TransferRecord,
		expectedVersion: number
	): void => {
		if (record.version !== expectedVersion) {
			throw new TransferVersionConflictError();
		}
	};

	const assertEditable = (record: TransferRecord): void => {
		if (record.deletedAt !== null) {
			throw new TransferDeletedError();
		}
	};

	const resolveContact = async (
		householdId: string,
		contactId: string | null,
		current?: TransferRecord
	): Promise<TransferContactSelection> => {
		if (contactId === null) {
			return null;
		}

		const contact = await dependencies.contactRepository.findById(
			householdId,
			contactId
		);

		if (contact === undefined) {
			throw new TransferReferenceUnavailableError();
		}

		if (
			contact.archivedAt !== null
			&& current?.contactId !== contact.id
		) {
			throw new TransferReferenceUnavailableError();
		}

		return {
			id: contact.id,
			name: contact.name
		};
	};

	return {
		assertEditable,
		assertVersion,
		requireAccounts,
		requireCurrent,
		resolveContact
	};
}
