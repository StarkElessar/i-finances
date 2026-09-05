import { randomUUID } from 'node:crypto';

import type { AccountRepository } from '@/modules/account';
import type { CategoryRepository } from '@/modules/category';
import type { ContactRepository } from '@/modules/contact';
import type { ExchangeRateResolver } from '@/modules/exchange-rate';
import type { HouseholdResolver } from '@/modules/household';

import type {
	AccountBalance,
	AccountLedger,
	ChangeOperationDeletionStateInput,
	CreateOperationInput,
	GetAccountLedgerInput,
	GetMonthlyExpenseSummaryInput,
	MonthlyExpenseSummary,
	PersistedOperation,
	RecalculateOperationRateInput,
	UpdateOperationInput
} from '@i-finances/contracts';

import { OperationVersionConflictError } from './operation-errors';
import { toPersistedOperation } from './operation-mappers';
import {
	createOperationRateSnapshot,
	getStoredOperationQuote
} from './operation-rate';
import type { OperationRepository } from './operation-repository';
import { OperationRules } from './operation-rules';

export type OperationServiceDependencies = {
	accountRepository: AccountRepository;
	categoryRepository: CategoryRepository;
	contactRepository: Pick<ContactRepository, 'findById'>;
	exchangeRateResolver: ExchangeRateResolver;
	householdResolver: HouseholdResolver;
	operationRepository: OperationRepository;
	createId?: () => string;
	now?: () => Date;
};

export class OperationService {
	private readonly createId: () => string;
	private readonly now: () => Date;
	private readonly rules: OperationRules;

	public constructor(private readonly dependencies: OperationServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
		this.rules = new OperationRules(
			dependencies.accountRepository,
			dependencies.categoryRepository,
			dependencies.contactRepository,
			dependencies.operationRepository,
			dependencies.householdResolver
		);
	}

	public async create(
		userId: string,
		input: CreateOperationInput
	): Promise<PersistedOperation> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const account = await this.rules.requireAccount(household.id, input.accountId, true);
		const references = await this.rules.resolveReferences(
			household.id,
			input.categoryId,
			input.contactId
		);
		const quote = await this.dependencies.exchangeRateResolver.resolve({
			fromCurrency: account.currency,
			onDate: input.happenedOn,
			toCurrency: household.baseCurrency
		});
		const rateSnapshot = createOperationRateSnapshot(
			input.amountMinor,
			quote,
			account.currency,
			household.baseCurrency
		);
		const timestamp = this.now();
		const record = await this.dependencies.operationRepository.insert({
			accountId: account.id,
			amountInHouseholdBaseCurrencyMinor: rateSnapshot.amountInHouseholdBaseCurrencyMinor,
			amountMinor: input.amountMinor,
			categoryId: references.category?.id ?? null,
			categoryNameSnapshot: references.category?.name ?? null,
			comment: input.comment,
			contactId: references.contact?.id ?? null,
			contactNameSnapshot: references.contact?.name ?? null,
			createdAt: timestamp,
			createdByUserId: userId,
			currency: account.currency,
			deletedAt: null,
			deletedByUserId: null,
			exchangeRate: quote.rate,
			exchangeRateEffectiveOn: quote.effectiveOn,
			exchangeRateSource: quote.source,
			happenedOn: input.happenedOn,
			householdBaseCurrency: household.baseCurrency,
			householdId: household.id,
			id: this.createId(),
			title: input.title,
			type: input.type,
			updatedAt: timestamp,
			updatedByUserId: userId,
			version: 1
		});

		return toPersistedOperation(record, {
			categoryName: references.category?.name,
			contactName: references.contact?.name
		});
	}

	public async update(
		userId: string,
		input: UpdateOperationInput
	): Promise<PersistedOperation> {
		const current = await this.rules.requireCurrent(userId, input.id);

		this.rules.assertVersion(current.record, input.version);
		this.rules.assertEditable(current.record);

		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const account = await this.rules.requireAccount(household.id, current.record.accountId, false);
		const references = await this.rules.resolveReferences(
			household.id,
			input.categoryId,
			input.contactId,
			current.record
		);
		const quote = current.record.happenedOn === input.happenedOn
			? getStoredOperationQuote(current.record)
			: await this.dependencies.exchangeRateResolver.resolve({
				fromCurrency: account.currency,
				onDate: input.happenedOn,
				toCurrency: household.baseCurrency
			});
		const rateSnapshot = createOperationRateSnapshot(
			input.amountMinor,
			quote,
			account.currency,
			household.baseCurrency
		);
		const updated = await this.dependencies.operationRepository.update(
			household.id,
			current.record.id,
			input.version,
			{
				amountInHouseholdBaseCurrencyMinor: rateSnapshot.amountInHouseholdBaseCurrencyMinor,
				amountMinor: input.amountMinor,
				categoryId: references.category?.id ?? null,
				categoryNameSnapshot: getReferenceSnapshot(
					input.categoryId,
					current.record.categoryId,
					current.record.categoryNameSnapshot,
					references.category?.name
				),
				comment: input.comment,
				contactId: references.contact?.id ?? null,
				contactNameSnapshot: getReferenceSnapshot(
					input.contactId,
					current.record.contactId,
					current.record.contactNameSnapshot,
					references.contact?.name
				),
				currency: account.currency,
				exchangeRate: quote.rate,
				exchangeRateEffectiveOn: quote.effectiveOn,
				exchangeRateSource: quote.source,
				happenedOn: input.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				title: input.title,
				type: input.type,
				updatedAt: this.now(),
				updatedByUserId: userId
			}
		);

		if (updated === undefined) {
			throw new OperationVersionConflictError();
		}

		return toPersistedOperation(updated, {
			categoryName: references.category?.name,
			contactName: references.contact?.name
		});
	}

	public getAccountBalances(userId: string): Promise<AccountBalance[]> {
		return this.getBalances(userId);
	}

	public async getAccountLedger(
		userId: string,
		input: GetAccountLedgerInput
	): Promise<AccountLedger> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const account = await this.rules.requireAccount(household.id, input.accountId, false);
		const [signedTotalBefore, rows] = await Promise.all([
			this.dependencies.operationRepository.getSignedTotalBefore(
				household.id,
				account.id,
				input.start
			),
			this.dependencies.operationRepository.listLedger(
				household.id,
				account.id,
				input.start,
				input.end
			)
		]);
		const openingBalanceMinor = addSafeMinorUnits(account.initialBalanceMinor, signedTotalBefore);
		let runningBalanceMinor = openingBalanceMinor;
		const items = rows.map((row) => {
			const operation = toPersistedOperation(row.operation, {
				categoryName: row.categoryName,
				contactName: row.contactName
			});
			const signedAmountMinor = operation.type === 'expense'
				? -operation.amountMinor
				: operation.amountMinor;

			runningBalanceMinor = addSafeMinorUnits(runningBalanceMinor, signedAmountMinor);

			return {
				...operation,
				balanceAfterMinor: runningBalanceMinor,
				signedAmountMinor
			};
		});

		return {
			accountCurrency: account.currency,
			accountId: account.id,
			closingBalanceMinor: runningBalanceMinor,
			householdBaseCurrency: household.baseCurrency,
			items,
			openingBalanceMinor,
			range: {
				end: input.end,
				start: input.start
			}
		};
	}

	public async getMonthlyExpenseSummary(
		userId: string,
		input: GetMonthlyExpenseSummaryInput
	): Promise<MonthlyExpenseSummary> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const range = getMonthRange(input.month);
		const [categoryExpenses, contactExpenses] = await Promise.all([
			this.dependencies.operationRepository.listMonthlyCategoryExpenses(
				household.id,
				range.start,
				range.end
			),
			this.dependencies.operationRepository.listMonthlyContactExpenses(
				household.id,
				range.start,
				range.end
			)
		]);

		return {
			baseCurrency: household.baseCurrency,
			categoryExpensesMinor: toExpenseRecord(categoryExpenses),
			contactExpensesMinor: toExpenseRecord(contactExpenses),
			month: input.month
		};
	}

	public archive(
		userId: string,
		input: ChangeOperationDeletionStateInput
	): Promise<PersistedOperation> {
		return this.changeDeletionState(userId, input, true);
	}

	public restore(
		userId: string,
		input: ChangeOperationDeletionStateInput
	): Promise<PersistedOperation> {
		return this.changeDeletionState(userId, input, false);
	}

	public async recalculateRate(
		userId: string,
		input: RecalculateOperationRateInput
	): Promise<PersistedOperation> {
		const current = await this.rules.requireCurrent(userId, input.id);

		this.rules.assertVersion(current.record, input.version);
		this.rules.assertEditable(current.record);

		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const account = await this.rules.requireAccount(household.id, current.record.accountId, false);
		const quote = await this.dependencies.exchangeRateResolver.resolve({
			fromCurrency: account.currency,
			onDate: current.record.happenedOn,
			toCurrency: household.baseCurrency
		});
		const rateSnapshot = createOperationRateSnapshot(
			current.record.amountMinor,
			quote,
			account.currency,
			household.baseCurrency
		);
		const updated = await this.dependencies.operationRepository.update(
			household.id,
			current.record.id,
			input.version,
			{
				amountInHouseholdBaseCurrencyMinor: rateSnapshot.amountInHouseholdBaseCurrencyMinor,
				amountMinor: current.record.amountMinor,
				categoryId: current.record.categoryId,
				categoryNameSnapshot: current.record.categoryNameSnapshot,
				comment: current.record.comment,
				contactId: current.record.contactId,
				contactNameSnapshot: current.record.contactNameSnapshot,
				currency: account.currency,
				exchangeRate: quote.rate,
				exchangeRateEffectiveOn: quote.effectiveOn,
				exchangeRateSource: quote.source,
				happenedOn: current.record.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				title: current.record.title,
				type: current.record.type,
				updatedAt: this.now(),
				updatedByUserId: userId
			}
		);

		if (updated === undefined) {
			throw new OperationVersionConflictError();
		}

		return toPersistedOperation(updated);
	}

	private async getBalances(userId: string): Promise<AccountBalance[]> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const accounts = await this.dependencies.accountRepository.list(household.id, false);
		const operationTotals = await this.dependencies.operationRepository.getSignedTotalsByAccount(
			household.id,
			accounts.map((account) => account.id)
		);

		return accounts.map((account) => {
			const balanceMinor = account.initialBalanceMinor + (operationTotals.get(account.id) ?? 0);

			if (!Number.isSafeInteger(balanceMinor)) {
				throw new Error('Account balance exceeds the safe integer range.');
			}

			return {
				accountId: account.id,
				balanceMinor,
				currency: account.currency
			};
		});
	}

	private async changeDeletionState(
		userId: string,
		input: ChangeOperationDeletionStateInput,
		deleted: boolean
	): Promise<PersistedOperation> {
		const current = await this.rules.requireCurrent(userId, input.id);

		this.rules.assertVersion(current.record, input.version);
		const alreadyInTargetState = deleted
			? current.record.deletedAt !== null
			: current.record.deletedAt === null;

		if (alreadyInTargetState) {
			return toPersistedOperation(current.record);
		}

		const timestamp = this.now();
		const updated = await this.dependencies.operationRepository.setDeletedAt(
			current.householdId,
			current.record.id,
			input.version,
			deleted ? timestamp : null,
			deleted ? userId : null,
			timestamp,
			userId
		);

		if (updated === undefined) {
			throw new OperationVersionConflictError();
		}

		return toPersistedOperation(updated);
	}
}

function getReferenceSnapshot(
	nextId: string | null,
	currentId: string | null,
	currentSnapshot: string | null,
	nextName?: string
): string | null {
	if (nextId === null) {
		return null;
	}

	return nextId === currentId ? currentSnapshot : nextName ?? null;
}

function addSafeMinorUnits(left: number, right: number): number {
	const result = left + right;

	if (!Number.isSafeInteger(result)) {
		throw new Error('Ledger balance exceeds the safe integer range.');
	}

	return result;
}

function getMonthRange(monthKey: string): { end: string; start: string } {
	const [year, month] = monthKey.split('-').map(Number);
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, '0');

	return {
		end: `${monthKey}-${lastDay}`,
		start: `${monthKey}-01`
	};
}

function toExpenseRecord(
	totals: readonly { referenceId: string | null; totalMinor: number }[]
): Record<string, number> {
	return Object.fromEntries(
		totals.flatMap((total) => total.referenceId === null
			? []
			: [[total.referenceId, total.totalMinor]])
	);
}
