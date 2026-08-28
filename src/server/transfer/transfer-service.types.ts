import type {
	ChangeTransferDeletionStateInput,
	CreateTransferInput,
	GetTransferInput,
	UpdateTransferInput
} from '~/entities/transfer/api/transfer.contract';
import type { Transfer } from '~/entities/transfer/model/types';

import type { AccountRepository } from '~/server/account/account-repository';
import type { ContactRepository } from '~/server/contact/contact-repository';
import type { ExchangeRateResolver } from '~/server/exchange-rate/exchange-rate-service';
import type { HouseholdResolver } from '~/server/household/household-service';

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
