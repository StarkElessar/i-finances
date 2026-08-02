import type {
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetMonthlyExpenseSummaryInput,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from '~/entities/operation/api/operation.contract';
import type {
	AccountBalance,
	AccountLedger,
	MonthlyExpenseSummary,
	Operation
} from '~/entities/operation/model/types';

import type { AccountRepository } from '~/server/account/account-repository';
import type { CategoryRepository } from '~/server/category/category-repository';
import type { ContactRepository } from '~/server/contact/contact-repository';
import type { ExchangeRateResolver } from '~/server/exchange-rate/exchange-rate-service';
import type { HouseholdResolver } from '~/server/household/household-service';

import type { OperationRepository } from './operation-repository';

export type OperationService = {
	create: (
		userId: string,
		input: CreateOperationInput
	) => Promise<Operation>;
	getAccountBalances: (
		userId: string
	) => Promise<AccountBalance[]>;
	getAccountLedger: (
		userId: string,
		input: GetAccountLedgerInput
	) => Promise<AccountLedger>;
	getMonthlyExpenseSummary: (
		userId: string,
		input: GetMonthlyExpenseSummaryInput
	) => Promise<MonthlyExpenseSummary>;
	recalculateRate: (
		userId: string,
		input: RecalculateOperationRateInput
	) => Promise<Operation>;
	restore: (
		userId: string,
		input: ChangeOperationDeletionStateInput
	) => Promise<Operation>;
	softDelete: (
		userId: string,
		input: ChangeOperationDeletionStateInput
	) => Promise<Operation>;
	update: (
		userId: string,
		input: UpdateOperationInput
	) => Promise<Operation>;
};

export type OperationServiceDependencies = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	contactRepository: ContactRepository;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	operationRepository: OperationRepository;
	createId?: () => string;
	now?: () => Date;
};
