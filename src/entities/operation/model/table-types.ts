import type { OperationWithBalance } from './types';

export type OperationPeriodMode = 'week' | 'month' | 'year';
export type OperationSortDirection = 'asc' | 'desc';
export type OperationSortField = 'date' | 'category' | 'contact' | 'amount' | 'balance';

export type OperationSort = {
    direction: OperationSortDirection;
    field: OperationSortField;
};

export type OperationDateRange = {
    end: string;
    start: string;
};

export type OperationGroup = {
    closingBalanceMinor?: number;
    differenceMinor?: number;
    id: string;
    label: string;
    openingBalanceMinor?: number;
    operations: OperationWithBalance[];
    type: OperationSortField;
};
