import type {
    OperationDateRange,
    OperationGroup,
    OperationSort,
    OperationSortDirection
} from './table-types';
import type { Operation, OperationWithBalance } from './types';

import type { Account } from '~/entities/account';
import { amountToMinorUnits } from '~/shared/lib';

const NAME_COLLATOR = new Intl.Collator('ru-BY', {
    numeric: true,
    sensitivity: 'base'
});

export function getSignedOperationAmountMinor(operation: Operation): number {
    return operation.type === 'expense' ? -operation.amountMinor : operation.amountMinor;
}

export function getAccountOperationsWithBalances(
    account: Account,
    operations: readonly Operation[]
): OperationWithBalance[] {
    let runningBalanceMinor = account.initialBalanceMinor;

    return operations
        .filter((operation) => operation.accountId === account.id)
        .toSorted(compareCanonicalOperationOrder)
        .map((operation) => {
            const signedAmountMinor = getSignedOperationAmountMinor(operation);

            runningBalanceMinor += signedAmountMinor;

            return {
                ...operation,
                balanceAfterMinor: runningBalanceMinor,
                signedAmountMinor
            };
        });
}

export function getAccountBalanceMinor(
    account: Account,
    operations: readonly Operation[]
): number {
    return operations.reduce((balanceMinor, operation) => {
        if (operation.accountId !== account.id) {
            return balanceMinor;
        }

        return balanceMinor + getSignedOperationAmountMinor(operation);
    }, account.initialBalanceMinor);
}

export function filterOperationRows(
    rows: readonly OperationWithBalance[],
    range: OperationDateRange,
    query: string
): OperationWithBalance[] {
    const periodRows = rows.filter((operation) => (
        operation.happenedOn >= range.start && operation.happenedOn <= range.end
    ));
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-BY');

    if (!normalizedQuery) {
        return periodRows;
    }

    const numericQueryMinor = parseNumericSearchQuery(normalizedQuery);

    if (numericQueryMinor !== undefined) {
        return periodRows.filter((operation) => operation.amountMinor === numericQueryMinor);
    }

    return periodRows.filter((operation) => {
        const searchableValue = [
            operation.title,
            operation.comment,
            operation.categoryName ?? '',
            operation.payeeName ?? ''
        ].join('\n').toLocaleLowerCase('ru-BY');

        return searchableValue.includes(normalizedQuery);
    });
}

export function createOperationGroups(
    visibleRows: readonly OperationWithBalance[],
    allAccountRows: readonly OperationWithBalance[],
    sort: OperationSort
): OperationGroup[] {
    if (sort.field === 'date') {
        return createDateGroups(visibleRows, allAccountRows, sort.direction);
    }

    if (sort.field === 'category' || sort.field === 'payee') {
        return createNamedGroups(visibleRows, sort);
    }

    return [{
        id: `group-${sort.field}`,
        label: sort.field === 'amount' ? 'Сумма' : 'Баланс счёта',
        operations: visibleRows.toSorted((left, right) => compareNumericRows(left, right, sort)),
        type: sort.field
    }];
}

function createDateGroups(
    visibleRows: readonly OperationWithBalance[],
    allAccountRows: readonly OperationWithBalance[],
    direction: OperationSortDirection
): OperationGroup[] {
    const visibleRowsByDate = groupRowsByKey(visibleRows, (operation) => operation.happenedOn);
    const allRowsByDate = groupRowsByKey(allAccountRows, (operation) => operation.happenedOn);
    const dates = [...visibleRowsByDate.keys()].toSorted((left, right) => {
        return direction === 'desc' ? right.localeCompare(left) : left.localeCompare(right);
    });

    return dates.map((date) => {
        const allDateRows = allRowsByDate.get(date) ?? [];
        const firstOperation = allDateRows[0];
        const lastOperation = allDateRows.at(-1);
        const openingBalanceMinor = firstOperation.balanceAfterMinor - firstOperation.signedAmountMinor;
        const closingBalanceMinor = lastOperation?.balanceAfterMinor ?? openingBalanceMinor;
        const operations = [...(visibleRowsByDate.get(date) ?? [])].toSorted((left, right) => {
            return direction === 'desc'
                ? left.sourceOrder - right.sourceOrder
                : right.sourceOrder - left.sourceOrder;
        });

        return {
            closingBalanceMinor,
            differenceMinor: closingBalanceMinor - openingBalanceMinor,
            id: `group-date-${date}`,
            label: date,
            openingBalanceMinor,
            operations,
            type: 'date'
        };
    });
}

function createNamedGroups(
    visibleRows: readonly OperationWithBalance[],
    sort: OperationSort
): OperationGroup[] {
    const rowsByName = groupRowsByKey(visibleRows, (operation) => {
        if (sort.field === 'category') {
            return operation.categoryName || 'Без категории';
        }

        return operation.payeeName || 'Без получателя';
    });
    const names = [...rowsByName.keys()].toSorted((left, right) => {
        const result = NAME_COLLATOR.compare(left, right);

        return sort.direction === 'asc' ? result : -result;
    });

    return names.map((name) => ({
        id: `group-${sort.field}-${name}`,
        label: name,
        operations: (rowsByName.get(name) ?? []).toSorted(compareNewestOperationFirst),
        type: sort.field
    }));
}

function groupRowsByKey(
    rows: readonly OperationWithBalance[],
    getKey: (operation: OperationWithBalance) => string
): Map<string, OperationWithBalance[]> {
    const rowsByKey = new Map<string, OperationWithBalance[]>();

    rows.forEach((operation) => {
        const key = getKey(operation);
        const groupedRows = rowsByKey.get(key) ?? [];

        groupedRows.push(operation);
        rowsByKey.set(key, groupedRows);
    });

    return rowsByKey;
}

function compareCanonicalOperationOrder(left: Operation, right: Operation): number {
    const dateResult = left.happenedOn.localeCompare(right.happenedOn);

    return dateResult || left.sourceOrder - right.sourceOrder;
}

function compareNewestOperationFirst(left: Operation, right: Operation): number {
    const dateResult = right.happenedOn.localeCompare(left.happenedOn);

    return dateResult || left.sourceOrder - right.sourceOrder;
}

function compareNumericRows(
    left: OperationWithBalance,
    right: OperationWithBalance,
    sort: OperationSort
): number {
    const leftValue = sort.field === 'amount' ? left.signedAmountMinor : left.balanceAfterMinor;
    const rightValue = sort.field === 'amount' ? right.signedAmountMinor : right.balanceAfterMinor;
    const result = leftValue - rightValue;

    if (result === 0) {
        return compareNewestOperationFirst(left, right);
    }

    return sort.direction === 'asc' ? result : -result;
}

function parseNumericSearchQuery(query: string): number | undefined {
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(query)) {
        return undefined;
    }

    const amount = Number(query.replace(',', '.'));

    return Number.isFinite(amount) ? amountToMinorUnits(amount) : undefined;
}
