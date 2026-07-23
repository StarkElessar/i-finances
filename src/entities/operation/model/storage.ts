import type { Operation, OperationExchangeRate, OperationType } from './types';

import { CurrencyCode, normalizeExchangeRate } from '~/shared/lib';

export const OPERATION_STORAGE_KEY = 'i-finances.operations.v1';

/**
 * Reads valid persisted operations and skips malformed records independently.
 */
export function readOperationsFromStorage(storage: Storage): Operation[] | undefined {
    const rawValue = storage.getItem(OPERATION_STORAGE_KEY);

    if (!rawValue) {
        return undefined;
    }

    try {
        const parsedValue: unknown = JSON.parse(rawValue);

        if (!Array.isArray(parsedValue)) {
            return undefined;
        }

        return parsedValue
            .map(normalizeStoredOperation)
            .filter((operation): operation is Operation => operation !== undefined);
    }
    catch {
        return undefined;
    }
}

/**
 * Persists the complete operation ledger, including soft-deleted records.
 */
export function writeOperationsToStorage(
    storage: Storage,
    operations: readonly Operation[]
): void {
    storage.setItem(OPERATION_STORAGE_KEY, JSON.stringify(operations));
}

function normalizeStoredOperation(value: unknown): Operation | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const accountId = normalizeRequiredString(value.accountId);
    const amountInFamilyCurrencyMinor = normalizeMinorUnits(value.amountInFamilyCurrencyMinor);
    const amountMinor = normalizeMinorUnits(value.amountMinor);
    const categoryId = normalizeOptionalString(value.categoryId);
    const categoryName = normalizeOptionalString(value.categoryName);
    const comment = typeof value.comment === 'string' ? value.comment.trim() : undefined;
    const contactId = normalizeOptionalString(value.contactId);
    const contactName = normalizeOptionalString(value.contactName);
    const createdAt = normalizeTimestamp(value.createdAt);
    const currency = normalizeCurrency(value.currency);
    const deletedAt = normalizeNullableTimestamp(value.deletedAt);
    const exchangeRate = normalizeStoredExchangeRate(value.exchangeRate);
    const happenedOn = normalizeDateKey(value.happenedOn);
    const id = normalizeRequiredString(value.id);
    const sourceOrder = normalizeInteger(value.sourceOrder);
    const title = normalizeRequiredString(value.title);
    const type = normalizeOperationType(value.type);
    const updatedAt = normalizeTimestamp(value.updatedAt);

    if (
        accountId === undefined
        || amountInFamilyCurrencyMinor === undefined
        || amountMinor === undefined
        || categoryId === undefined
        || categoryName === undefined
        || comment === undefined
        || contactId === undefined
        || contactName === undefined
        || createdAt === undefined
        || currency === undefined
        || deletedAt === undefined
        || exchangeRate === undefined
        || happenedOn === undefined
        || id === undefined
        || sourceOrder === undefined
        || title === undefined
        || type === undefined
        || updatedAt === undefined
    ) {
        return undefined;
    }

    return {
        accountId,
        amountInFamilyCurrencyMinor,
        amountMinor,
        categoryId,
        categoryName,
        comment,
        contactId,
        contactName,
        createdAt,
        currency,
        deletedAt,
        exchangeRate,
        happenedOn,
        id,
        sourceOrder,
        title,
        type,
        updatedAt
    };
}

function normalizeStoredExchangeRate(value: unknown): OperationExchangeRate | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const fromCurrency = normalizeCurrency(value.fromCurrency);
    const rate = typeof value.rate === 'string'
        ? normalizeExchangeRate(value.rate)
        : undefined;
    const toCurrency = normalizeCurrency(value.toCurrency);

    if (fromCurrency === undefined || rate === undefined || toCurrency === undefined) {
        return undefined;
    }

    return {
        fromCurrency,
        rate,
        toCurrency
    };
}

function normalizeCurrency(value: unknown) {
    return typeof value === 'string' && CurrencyCode.isCurrencyCode(value)
        ? value
        : undefined;
}

function normalizeOperationType(value: unknown): OperationType | undefined {
    return value === 'expense' || value === 'income' ? value : undefined;
}

function normalizeMinorUnits(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function normalizeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value)
        ? value
        : undefined;
}

function normalizeRequiredString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim()
        ? value.trim()
        : undefined;
}

function normalizeOptionalString(value: unknown): string | null | undefined {
    if (value === null) {
        return null;
    }

    return typeof value === 'string' ? value.trim() || null : undefined;
}

function normalizeTimestamp(value: unknown): string | undefined {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
        ? value
        : undefined;
}

function normalizeNullableTimestamp(value: unknown): string | null | undefined {
    return value === null ? null : normalizeTimestamp(value);
}

function normalizeDateKey(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
        return undefined;
    }

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    return date.getFullYear() === Number(match[1])
        && date.getMonth() === Number(match[2]) - 1
        && date.getDate() === Number(match[3])
        ? value
        : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
