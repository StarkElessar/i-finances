import type { OperationSort, OperationSortDirection, OperationSortField } from '@/entities/operation';

/**
 * One item of the narrow-toolbar "Order" select: a sort field and a direction at once
 * (development/decisions/kit-open-questions.md, section 3).
 */
export type OperationSortOrderOption = {
	label: string;
	sort: OperationSort;
	/** `field:direction`, the `value` of the `<option>`. */
	value: string;
};

/** The order the list opens with; any other order gives the "Order" button its active look. */
export const DEFAULT_OPERATION_SORT: OperationSort = { direction: 'desc', field: 'date' };

function createOption(field: OperationSortField, direction: OperationSortDirection, label: string): OperationSortOrderOption {
	return { label, sort: { direction, field }, value: `${field}:${direction}` };
}

/** Ten items, in this order; the direction a field gets when it is picked from a column header comes first. */
export const OPERATION_SORT_ORDER_OPTIONS: readonly OperationSortOrderOption[] = [
	createOption('date', 'desc', 'Дата, сначала новые'),
	createOption('date', 'asc', 'Дата, сначала старые'),
	createOption('amount', 'asc', 'Сумма, по возрастанию'),
	createOption('amount', 'desc', 'Сумма, по убыванию'),
	createOption('balance', 'asc', 'Баланс, по возрастанию'),
	createOption('balance', 'desc', 'Баланс, по убыванию'),
	createOption('category', 'asc', 'Категория, А–Я'),
	createOption('category', 'desc', 'Категория, Я–А'),
	createOption('contact', 'asc', 'Контакт, А–Я'),
	createOption('contact', 'desc', 'Контакт, Я–А')
];

/** The `<option>` value of a sort state. */
export function toSortOrderValue(sort: OperationSort): string {
	return `${sort.field}:${sort.direction}`;
}

/** The sort state of an `<option>` value, or `undefined` for a value that is not in the list. */
export function parseSortOrderValue(value: string): OperationSort | undefined {
	return OPERATION_SORT_ORDER_OPTIONS.find((option) => option.value === value)?.sort;
}

/** The label of the current order, for the `title` of the narrow select. */
export function getSortOrderLabel(sort: OperationSort): string {
	const value = toSortOrderValue(sort);

	return OPERATION_SORT_ORDER_OPTIONS.find((option) => option.value === value)?.label ?? '';
}

/** Whether the order is not the default one. */
export function isCustomSortOrder(sort: OperationSort): boolean {
	return toSortOrderValue(sort) !== toSortOrderValue(DEFAULT_OPERATION_SORT);
}
