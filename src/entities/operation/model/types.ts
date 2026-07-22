import type { CurrencyCodeValue } from '~/shared/lib';

export type OperationType = 'expense' | 'income';

export type Operation = {
    accountId: string;
    amountInFamilyCurrencyMinor: number;
    amountMinor: number;
    categoryId: string | null;
    categoryName: string | null;
    comment: string;
    contactId: string | null;
    contactName: string | null;
    createdAt: string;
    currency: CurrencyCodeValue;
    happenedOn: string;
    id: string;
    sourceOrder: number;
    title: string;
    type: OperationType;
    updatedAt: string;
};

export type OperationCategoryReference = {
    color: string;
    id: string;
    name: string;
};

export type OperationWithBalance = Operation & {
    balanceAfterMinor: number;
    signedAmountMinor: number;
};
