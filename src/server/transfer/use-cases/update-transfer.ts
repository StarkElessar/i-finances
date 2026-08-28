import {
	type UpdateTransferInput,
	updateTransferInputSchema
} from '~/entities/transfer/api/transfer.contract';
import type { Transfer } from '~/entities/transfer/model/types';

import {
	resolveTransferLegIds,
	toTransfer
} from '../transfer-mappers';
import { createTransferAmountPlan } from '../transfer-rate';
import type { TransferUseCaseContext } from '../transfer-service.types';

import { buildTransferLegValues } from './create-transfer';

/**
 * Creates the use case that updates a transfer and both linked ledger legs.
 */
export function createUpdateTransferUseCase(
	context: TransferUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: UpdateTransferInput
	): Promise<Transfer> => {
		const input = updateTransferInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const current = await context.rules.requireCurrent(
			household.id,
			input.id
		);

		context.rules.assertEditable(current.transfer);
		context.rules.assertVersion(current.transfer, input.version);

		const { fromAccount, toAccount } = await context.rules.requireAccounts(
			household.id,
			input.fromAccountId,
			input.toAccountId
		);
		const contact = await context.rules.resolveContact(
			household.id,
			input.contactId,
			current.transfer
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
		const expense = current.legs.find((leg) => leg.type === 'expense');
		const income = current.legs.find((leg) => leg.type === 'income');

		if (expense === undefined || income === undefined) {
			throw new Error('Transfer is missing linked ledger operations.');
		}

		const updated = await context.transferRepository.updateWithLegs(
			household.id,
			input.id,
			input.version,
			{
				comment: input.comment,
				contactId: contact?.id ?? null,
				contactNameSnapshot: contact?.name ?? null,
				exchangeFromCurrency: fromAccount.currency,
				exchangeRate: input.exchangeRate,
				exchangeToCurrency: toAccount.currency,
				fromAccountId: fromAccount.id,
				fromAmountMinor: input.fromAmountMinor,
				happenedOn: input.happenedOn,
				toAccountId: toAccount.id,
				toAmountMinor: amountPlan.toAmountMinor,
				updatedAt: timestamp,
				updatedByUserId: userId
			},
			buildTransferLegValues({
				account: fromAccount,
				amountMinor: input.fromAmountMinor,
				comment: input.comment,
				contactId: contact?.id ?? null,
				contactName: contact?.name ?? null,
				createdAt: expense.createdAt,
				createdByUserId: expense.createdByUserId,
				happenedOn: input.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				householdId: household.id,
				id: expense.id,
				leg: amountPlan.fromLeg,
				peerAccountName: toAccount.name,
				titleDirection: 'to',
				transferId: current.transfer.id,
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
				createdAt: income.createdAt,
				createdByUserId: income.createdByUserId,
				happenedOn: input.happenedOn,
				householdBaseCurrency: household.baseCurrency,
				householdId: household.id,
				id: income.id,
				leg: amountPlan.toLeg,
				peerAccountName: fromAccount.name,
				titleDirection: 'from',
				transferId: current.transfer.id,
				type: 'income',
				updatedAt: timestamp,
				updatedByUserId: userId
			})
		);

		if (updated === undefined) {
			const latest = await context.rules.requireCurrent(
				household.id,
				input.id
			);

			context.rules.assertEditable(latest.transfer);
			context.rules.assertVersion(latest.transfer, input.version);
			throw new Error('Transfer update failed unexpectedly.');
		}

		return toTransfer(
			updated.transfer,
			resolveTransferLegIds(updated.legs),
			contact?.name
		);
	};
}
