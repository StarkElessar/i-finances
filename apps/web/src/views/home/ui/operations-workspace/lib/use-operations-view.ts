import type { Category } from '@/entities/category';
import { DEFAULT_CATEGORY_ICON_ID, resolveCategoryIconId } from '@/entities/category';
import type {
	OperationGroup,
	OperationPeriodMode,
	OperationSort,
	OperationWithBalance
} from '@/entities/operation';
import {
	canMoveToNextOperationPeriod,
	createOperationGroups,
	filterOperationRows,
	getAccountLedger,
	getOperationPeriodRange,
	parseLocalDateKey
} from '@/entities/operation';

import type { Account } from '@/entities/account';

import { createAsync } from '@solidjs/router';
import type { Accessor } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';

const FALLBACK_CATEGORY_COLOR = '#778398';

export type UseOperationsViewOptions = {
	account: Account;
	categories: readonly Category[];
	periodFrom: string;
	periodMode: OperationPeriodMode;
};

export type OperationsView = {
	canMoveToNextPeriod: Accessor<boolean>;
	groups: Accessor<OperationGroup[]>;
	isLoading: Accessor<boolean>;
	periodAnchor: Accessor<Date>;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	searchQuery: Accessor<string>;
	setSearchQuery: (value: string) => void;
	setSort: (sort: OperationSort) => void;
	sort: Accessor<OperationSort>;
};

/**
 * Owns everything the operations screen needs regardless of whether it's
 * rendered as a table or a mobile list: the ledger fetch, search/sort state,
 * derived groups, and category color/icon lookups.
 */
export function useOperationsView(options: UseOperationsViewOptions): OperationsView {
	const [sort, setSort] = createSignal<OperationSort>({ direction: 'desc', field: 'date' });
	const [searchQuery, setSearchQuery] = createSignal('');

	const periodAnchor = createMemo(() => parseLocalDateKey(options.periodFrom));
	const periodRange = createMemo(() => getOperationPeriodRange(periodAnchor(), options.periodMode));
	const ledger = createAsync(() => getAccountLedger({
		accountId: options.account.id,
		...periodRange()
	}));
	const accountRows = () => ledger()?.items ?? [];
	const visibleRows = createMemo(() => filterOperationRows(accountRows(), periodRange(), searchQuery()));
	const groups = createMemo(() => createOperationGroups(visibleRows(), accountRows(), sort()));

	const categoryColorById = createMemo(() => {
		const colorById = new Map<string, string>();

		options.categories.forEach((category) => colorById.set(category.id, category.color));

		return colorById;
	});
	const categoryColorByName = createMemo(() => {
		const colorByName = new Map<string, string>();

		options.categories.forEach((category) => colorByName.set(category.name, category.color));

		return colorByName;
	});
	const categoryIconById = createMemo(() => {
		const iconById = new Map<string, string>();

		options.categories.forEach((category) => {
			iconById.set(category.id, resolveCategoryIconId(category.icon));
		});

		return iconById;
	});
	const categoryIconByName = createMemo(() => {
		const iconByName = new Map<string, string>();

		options.categories.forEach((category) => {
			iconByName.set(category.name, resolveCategoryIconId(category.icon));
		});

		return iconByName;
	});

	const resolveCategoryColor = (operation: OperationWithBalance): string => {
		if (operation.categoryId) {
			const colorById = categoryColorById().get(operation.categoryId);

			if (colorById) {
				return colorById;
			}
		}

		return operation.categoryName
			? categoryColorByName().get(operation.categoryName) ?? FALLBACK_CATEGORY_COLOR
			: FALLBACK_CATEGORY_COLOR;
	};
	const resolveCategoryIcon = (operation: OperationWithBalance): string => {
		if (operation.categoryId) {
			const iconById = categoryIconById().get(operation.categoryId);

			if (iconById) {
				return iconById;
			}
		}

		return operation.categoryName
			? categoryIconByName().get(operation.categoryName) ?? DEFAULT_CATEGORY_ICON_ID
			: DEFAULT_CATEGORY_ICON_ID;
	};

	return {
		canMoveToNextPeriod: createMemo(() => canMoveToNextOperationPeriod(periodAnchor(), options.periodMode, new Date())),
		groups,
		isLoading: () => ledger() === undefined,
		periodAnchor,
		resolveCategoryColor,
		resolveCategoryIcon,
		searchQuery,
		setSearchQuery,
		setSort,
		sort
	};
}
