import {
	type GetMonthlyExpenseSummaryInput,
	getMonthlyExpenseSummaryInputSchema
} from '~/entities/operation/api/operation.contract';
import type { MonthlyExpenseSummary } from '~/entities/operation/model/types';

import type { ReferenceExpenseTotal } from '../operation-repository';
import type { OperationUseCaseContext } from '../operation-use-case.types';

export function createGetMonthlyExpenseSummaryUseCase(
	context: OperationUseCaseContext
) {
	return async (
		userId: string,
		unsafeInput: GetMonthlyExpenseSummaryInput
	): Promise<MonthlyExpenseSummary> => {
		const input = getMonthlyExpenseSummaryInputSchema.parse(unsafeInput);
		const household = await context.householdResolver.requireForUser(userId);
		const range = getMonthRange(input.month);
		const [categoryExpenses, contactExpenses] = await Promise.all([
			context.operationRepository.listMonthlyCategoryExpenses(
				household.id,
				range.start,
				range.end
			),
			context.operationRepository.listMonthlyContactExpenses(
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
	};
}

function getMonthRange(monthKey: string): { end: string; start: string } {
	const [year, month] = monthKey.split('-').map(Number);
	const lastDay = new Date(Date.UTC(year, month, 0))
		.getUTCDate()
		.toString()
		.padStart(2, '0');

	return {
		end: `${monthKey}-${lastDay}`,
		start: `${monthKey}-01`
	};
}

function toExpenseRecord(
	totals: readonly ReferenceExpenseTotal[]
): Record<string, number> {
	return Object.fromEntries(
		totals.map((total) => [total.referenceId, total.totalMinor])
	);
}
