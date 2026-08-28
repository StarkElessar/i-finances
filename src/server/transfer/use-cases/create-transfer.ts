import type { CurrencyCodeValue } from '~/shared/lib';

import {
	type CreateTransferInput,
	createTransferInputSchema
} from '~/entities/transfer/api/transfer.contract';
import type { Transfer } from '~/entities/transfer/model/types';

import type { AccountRecord } from '~/server/db/schema';

import {
	resolveTransferLegIds,
	toTransfer
} from '../transfer-mappers';
import { createTransferAmountPlan } from '../transfer-rate';
import type { TransferUseCaseContext } from '../transfer-service.types';

/**
 * Creates the use case that records a cross-currency transfer and both ledger legs.
 */
export function createCreateTransferUseCase(
	context: TransferUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: CreateTransferInput
	): Promise<Transfer> => {
		const input = createTransferInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const { fromAccount, toAccount } = await context.rules.requireAccounts(
			household.id,
			input.fromAccountId,
			input.toAccountId
		);
		const contact = await context.rules.resolveContact(
			household.id,
			input.contactId
		);
		const amountPlan = await createTransferAmountPlan({
			fromAmountMinor: input.fromAmountMinor,
			fromCurrency: fromAccount.currency,
			happenedOn: input.happenedOn,
			householdBaseCurrency: household.baseCurrency,
			resolveForeignBaseQuote: () => context.exchangeRateResolver.resolve({
				fromCurrency: fromAccount.currency,
				onDate: input.happenedOn,
				toCurrency: household.baseCurrency
			}),
			toCurrency: toAccount.currency,
			transferRate: input.exchangeRate
		});
		const timestamp = context.now();
		const transferId = context.createId();
		const fromOperationId = context.createId();
		const toOperationId = context.createId();
		const created = await context.transferRepository.insertWithLegs(
			{
				comment: input.comment,
				contactId: contact?.id ?? null,
				contactNameSnapshot: contact?.name ?? null,
				createdAt: timestamp,
				createdByUserId: userId,
				deletedAt: null,
				deletedByUserId: null,
				exchangeFromCurrency: fromAccount.currency,
				exchangeRate: input.exchangeRate,
				exchangeToCurrency: toAccount.currency,
				fromAccountId: fromAccount.id,
				fromAmountMinor: input.fromAmountMinor,
				happenedOn: input.happenedOn,
				householdId: household.id,
				id: transferId,
				toAccountId: toAccount.id,
				toAmountMinor: amountPlan.toAmountMinor,
				updatedAt: timestamp,
				updatedByUserId: userId,
				version: 1
			},
			buildTransferLegValues({
				account: fromAccount,
				amountMinor: input.fromAmountMinor,
				comment: input.comment,
				contactId: contact?.id ?? null,
				contactName: contact?.name ?? null,
				createdAt: timestamp,
				createdByUserId: userId,
				happenedOn: input.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				householdId: household.id,
				id: fromOperationId,
				leg: amountPlan.fromLeg,
				peerAccountName: toAccount.name,
				titleDirection: 'to',
				transferId,
				type: 'expense',
				updatedAt: timestamp,
				updatedByUserId: userId
			}),
			buildTransferLegValues({
				account: toAccount,
				amountMinor: amountPlan.toAmountMinor,
				comment: input.comment,
				contactId: contact?.id ?? null,
				contactName: contact?.name ?? null,
				createdAt: timestamp,
				createdByUserId: userId,
				happenedOn: input.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				householdId: household.id,
				id: toOperationId,
				leg: amountPlan.toLeg,
				peerAccountName: fromAccount.name,
				titleDirection: 'from',
				transferId,
				type: 'income',
				updatedAt: timestamp,
				updatedByUserId: userId
			})
		);

		return toTransfer(
			created.transfer,
			resolveTransferLegIds(created.legs),
			contact?.name
		);
	};
}

/**
 * Builds one ledger operation payload for a transfer leg.
 */
export function buildTransferLegValues(input: {
	account: AccountRecord;
	amountMinor: number;
	comment: string;
	contactId: string | null;
	contactName: string | null;
	createdAt: Date;
	createdByUserId: string;
	happenedOn: string;
	householdBaseCurrency: CurrencyCodeValue;
	householdId: string;
	id: string;
	leg: {
		amountInHouseholdBaseCurrencyMinor: number;
		effectiveOn: string;
		rate: string;
		source: string;
	};
	peerAccountName: string;
	titleDirection: 'from' | 'to';
	transferId: string;
	type: 'expense' | 'income';
	updatedAt: Date;
	updatedByUserId: string;
}) {
	return {
		accountId: input.account.id,
		amountInHouseholdBaseCurrencyMinor:
			input.leg.amountInHouseholdBaseCurrencyMinor,
		amountMinor: input.amountMinor,
		categoryId: null,
		categoryNameSnapshot: null,
		comment: input.comment,
		contactId: input.contactId,
		contactNameSnapshot: input.contactName,
		createdAt: input.createdAt,
		createdByUserId: input.createdByUserId,
		currency: input.account.currency,
		deletedAt: null,
		deletedByUserId: null,
		exchangeRate: input.leg.rate,
		exchangeRateEffectiveOn: input.leg.effectiveOn,
		exchangeRateSource: input.leg.source,
		happenedOn: input.happenedOn,
		householdBaseCurrency: input.householdBaseCurrency,
		householdId: input.householdId,
		id: input.id,
		title: input.titleDirection === 'to'
			? `Перевод → ${input.peerAccountName}`
			: `Перевод ← ${input.peerAccountName}`,
		transferId: input.transferId,
		type: input.type,
		updatedAt: input.updatedAt,
		updatedByUserId: input.updatedByUserId,
		version: 1
	};
}
