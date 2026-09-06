import type {
	ChangeTransferDeletionStateInput,
	CreateTransferInput,
	GetTransferInput,
	UpdateTransferInput
} from '@i-finances/contracts';
import type { Transfer } from '@i-finances/contracts';

import type { AccountRepository } from '@/modules/account';
import type { ContactRepository } from '@/modules/contact';
import type { ExchangeRateResolver } from '@/modules/exchange-rate';
import type { HouseholdResolver } from '@/modules/household';

import type { TransferRepository } from './transfer-repository';
import type { TransferRules } from './transfer-rules';

export type TransferService = {
	create: (userId: string, input: CreateTransferInput) => Promise<Transfer>;
	getById: (userId: string, input: GetTransferInput) => Promise<Transfer>;
	softDelete: (
		userId: string,
		input: ChangeTransferDeletionStateInput
	) => Promise<Transfer>;
	update: (userId: string, input: UpdateTransferInput) => Promise<Transfer>;
};

export type TransferServiceDependencies = {
	accountRepository: AccountRepository;
	contactRepository: ContactRepository;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	transferRepository: TransferRepository;
	createId?: () => string;
	now?: () => Date;
};

export type TransferUseCaseContext = {
	accountRepository: AccountRepository;
	contactRepository: ContactRepository;
	createId: () => string;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	now: () => Date;
	rules: TransferRules;
	transferRepository: TransferRepository;
};
