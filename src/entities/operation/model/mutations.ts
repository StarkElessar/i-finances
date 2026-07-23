import type { Operation, OperationExchangeRate, OperationType } from './types';

import type { CurrencyCodeValue } from '~/shared/lib';
import {
    convertMinorUnitsByExchangeRate,
    normalizeExchangeRate
} from '~/shared/lib';

export type OperationFormValue = {
    amountMinor: number;
    categoryId: string | null;
    comment: string;
    contactId: string | null;
    exchangeRate: string;
    happenedOn: string;
    title: string;
    type: OperationType;
};

export type OperationReferenceSnapshot = {
    categoryName: string | null;
    contactName: string | null;
};

export type CreateOperationParams = OperationReferenceSnapshot & {
    accountId: string;
    allOperations: readonly Operation[];
    currency: CurrencyCodeValue;
    familyCurrency: CurrencyCodeValue;
    id: string;
    timestamp: string;
    value: OperationFormValue;
};

export type UpdateOperationParams = OperationReferenceSnapshot & {
    allOperations: readonly Operation[];
    familyCurrency: CurrencyCodeValue;
    timestamp: string;
    value: OperationFormValue;
};

/**
 * Creates a normalized operation while keeping persistence metadata outside UI code.
 */
export function createOperation(params: CreateOperationParams): Operation {
    const normalizedValue = normalizeOperationValue(params.value);
    const exchangeRate = createExchangeRateSnapshot(
        params.currency,
        params.familyCurrency,
        normalizedValue.exchangeRate
    );

    return {
        accountId: params.accountId,
        amountInFamilyCurrencyMinor: convertToFamilyCurrency(
            normalizedValue.amountMinor,
            exchangeRate
        ),
        amountMinor: normalizedValue.amountMinor,
        categoryId: normalizedValue.categoryId,
        categoryName: normalizeOptionalName(params.categoryName),
        comment: normalizedValue.comment,
        contactId: normalizedValue.contactId,
        contactName: normalizeOptionalName(params.contactName),
        createdAt: params.timestamp,
        currency: params.currency,
        deletedAt: null,
        exchangeRate,
        happenedOn: normalizedValue.happenedOn,
        id: params.id,
        sourceOrder: getLeadingSourceOrder(
            params.allOperations,
            normalizedValue.happenedOn
        ),
        title: normalizedValue.title,
        type: normalizedValue.type,
        updatedAt: params.timestamp
    };
}

/**
 * Updates editable fields and moves a date-changed operation to the top of its day.
 */
export function updateOperation(
    operation: Operation,
    params: UpdateOperationParams
): Operation {
    const normalizedValue = normalizeOperationValue(params.value);
    const exchangeRate = createExchangeRateSnapshot(
        operation.currency,
        params.familyCurrency,
        normalizedValue.exchangeRate
    );
    const dateChanged = operation.happenedOn !== normalizedValue.happenedOn;

    return {
        ...operation,
        amountInFamilyCurrencyMinor: convertToFamilyCurrency(
            normalizedValue.amountMinor,
            exchangeRate
        ),
        amountMinor: normalizedValue.amountMinor,
        categoryId: normalizedValue.categoryId,
        categoryName: normalizeOptionalName(params.categoryName),
        comment: normalizedValue.comment,
        contactId: normalizedValue.contactId,
        contactName: normalizeOptionalName(params.contactName),
        exchangeRate,
        happenedOn: normalizedValue.happenedOn,
        sourceOrder: dateChanged
            ? getLeadingSourceOrder(
                params.allOperations,
                normalizedValue.happenedOn,
                operation.id
            )
            : operation.sourceOrder,
        title: normalizedValue.title,
        type: normalizedValue.type,
        updatedAt: params.timestamp
    };
}

/**
 * Marks an operation as deleted without destroying accounting history.
 */
export function softDeleteOperation(
    operation: Operation,
    timestamp: string
): Operation {
    return {
        ...operation,
        deletedAt: timestamp,
        updatedAt: timestamp
    };
}

function normalizeOperationValue(value: OperationFormValue): OperationFormValue {
    const title = value.title.trim().replace(/\s+/g, ' ');

    if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor <= 0) {
        throw new Error('Operation amount must be a positive safe integer.');
    }

    if (!title) {
        throw new Error('Operation title is required.');
    }

    if (!isLocalDateKey(value.happenedOn)) {
        throw new Error(`Invalid operation date: ${value.happenedOn}`);
    }

    return {
        ...value,
        categoryId: normalizeOptionalName(value.categoryId),
        comment: value.comment.trim(),
        contactId: normalizeOptionalName(value.contactId),
        exchangeRate: value.exchangeRate,
        title
    };
}

function createExchangeRateSnapshot(
    fromCurrency: CurrencyCodeValue,
    toCurrency: CurrencyCodeValue,
    rateValue: string
): OperationExchangeRate {
    const rate = fromCurrency === toCurrency ? '1' : normalizeExchangeRate(rateValue);

    if (rate === undefined) {
        throw new Error(`Invalid exchange rate: ${rateValue}`);
    }

    return {
        fromCurrency,
        rate,
        toCurrency
    };
}

function convertToFamilyCurrency(
    amountMinor: number,
    exchangeRate: OperationExchangeRate
): number {
    return exchangeRate.fromCurrency === exchangeRate.toCurrency
        ? amountMinor
        : convertMinorUnitsByExchangeRate(amountMinor, exchangeRate.rate);
}

function getLeadingSourceOrder(
    operations: readonly Operation[],
    happenedOn: string,
    excludedOperationId?: string
): number {
    let leadingSourceOrder = 0;

    operations.forEach((operation) => {
        if (
            operation.deletedAt === null
            && operation.happenedOn === happenedOn
            && operation.id !== excludedOperationId
        ) {
            leadingSourceOrder = Math.min(leadingSourceOrder, operation.sourceOrder);
        }
    });

    return leadingSourceOrder - 1;
}

function normalizeOptionalName(value: string | null): string | null {
    return value?.trim().replace(/\s+/g, ' ') || null;
}

function isLocalDateKey(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return false;
    }

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    return date.getFullYear() === Number(match[1])
        && date.getMonth() === Number(match[2]) - 1
        && date.getDate() === Number(match[3]);
}
