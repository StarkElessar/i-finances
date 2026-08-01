import { toOperation } from '../operation-mappers';
import { createOperationRateSnapshot } from '../operation-rate';
import type { OperationUseCaseContext } from '../operation-use-case.types';

import {
	type CreateOperationInput,
	createOperationInputSchema
} from '~/entities/operation/api/operation.contract';
import type { Operation } from '~/entities/operation/model/types';

export function createCreateOperationUseCase(
	context: OperationUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: CreateOperationInput
	): Promise<Operation> => {
		const input = createOperationInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const account = await context.rules.requireAccount(
			household.id,
			input.accountId,
			true
		);
		const references = await context.rules.resolveReferences(
			household.id,
			input.categoryId,
			input.contactId
		);
		const quote = await context.exchangeRateResolver.resolve({
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
		const timestamp = context.now();
		const record = await context.operationRepository.insert({
			accountId: account.id,
			amountInHouseholdBaseCurrencyMinor:
				rateSnapshot.amountInHouseholdBaseCurrencyMinor,
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
			id: context.createId(),
			title: input.title,
			type: input.type,
			updatedAt: timestamp,
			updatedByUserId: userId,
			version: 1
		});

		return toOperation(record, {
			categoryName: references.category?.name,
			contactName: references.contact?.name
		});
	};
}
