import { parse } from 'csv-parse/browser/esm/sync';

import type { Operation, OperationCategoryReference } from './types';

import { CASH_ACCOUNT_ID } from '~/entities/account';
import type { Payee } from '~/entities/payee';
import { ACCENT_COLORS, amountToMinorUnits, CurrencyCode } from '~/shared/lib';

type CsvOperationRecord = {
    'Дата': string;
    'Сумма': string;
    'Название': string;
    'Получатель/Плательщик': string;
    'IBAN контакта': string;
    'Категория': string;
    'Комментарий': string;
};

export type ImportedOperationsData = {
    categories: OperationCategoryReference[];
    operations: Operation[];
    payees: Payee[];
};

const CSV_HEADER = 'Дата;Сумма;Название;Получатель/Плательщик;IBAN контакта;Категория;Комментарий';

export function importOperationsCsv(rawCsv: string): ImportedOperationsData {
    const csvBody = getCsvBody(rawCsv);
    const parsedRecords: unknown[] = parse(csvBody, {
        bom: true,
        columns: true,
        delimiter: ';',
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true
    });
    const records = parsedRecords.map((record, index) => {
        if (!isCsvOperationRecord(record)) {
            throw new Error(`Invalid operation CSV record at row ${index + 2}`);
        }

        return record;
    });
    const categoryByName = createCategoryReferences(records);
    const payeeByName = createPayees(records);

    return {
        categories: [...categoryByName.values()],
        operations: records.map((record, sourceOrder) => createOperation(
            record,
            sourceOrder,
            categoryByName,
            payeeByName
        )),
        payees: [...payeeByName.values()]
    };
}

function getCsvBody(rawCsv: string): string {
    const normalizedCsv = rawCsv.replace(/^\uFEFF/, '');
    const headerIndex = normalizedCsv.indexOf(CSV_HEADER);

    if (headerIndex < 0) {
        throw new Error('Operation CSV header was not found');
    }

    return normalizedCsv.slice(headerIndex);
}

function createCategoryReferences(records: readonly CsvOperationRecord[]): Map<string, OperationCategoryReference> {
    const categoryByName = new Map<string, OperationCategoryReference>();

    records.forEach((record) => {
        const name = normalizeText(record['Категория']);

        if (!name || categoryByName.has(name)) {
            return;
        }

        const colorIndex = categoryByName.size % ACCENT_COLORS.length;

        categoryByName.set(name, {
            color: ACCENT_COLORS[colorIndex],
            id: createStableEntityId('category', name),
            name
        });
    });

    return categoryByName;
}

function createPayees(records: readonly CsvOperationRecord[]): Map<string, Payee> {
    const payeeByName = new Map<string, Payee>();

    records.forEach((record) => {
        const name = normalizeCsvQuotes(normalizeText(record['Получатель/Плательщик']));

        if (!name || payeeByName.has(name)) {
            return;
        }

        payeeByName.set(name, {
            id: createStableEntityId('payee', name),
            isArchived: false,
            name,
            type: 'unknown'
        });
    });

    return payeeByName;
}

function createOperation(
    record: CsvOperationRecord,
    sourceOrder: number,
    categoryByName: ReadonlyMap<string, OperationCategoryReference>,
    payeeByName: ReadonlyMap<string, Payee>
): Operation {
    const signedAmountMinor = parseCsvAmountMinor(record['Сумма']);
    const categoryName = normalizeText(record['Категория']) || null;
    const payeeName = normalizeCsvQuotes(normalizeText(record['Получатель/Плательщик'])) || null;
    const happenedOn = parseCsvDate(record['Дата']);
    const timestamp = `${happenedOn}T12:00:00.000Z`;

    return {
        accountId: CASH_ACCOUNT_ID,
        amountInFamilyCurrencyMinor: Math.abs(signedAmountMinor),
        amountMinor: Math.abs(signedAmountMinor),
        categoryId: categoryName ? categoryByName.get(categoryName)?.id ?? null : null,
        categoryName,
        comment: normalizeText(record['Комментарий']),
        createdAt: timestamp,
        currency: CurrencyCode.BYN,
        happenedOn,
        id: `operation-imported-${sourceOrder + 1}`,
        payeeId: payeeName ? payeeByName.get(payeeName)?.id ?? null : null,
        payeeName,
        sourceOrder,
        title: normalizeText(record['Название']) || 'Без названия',
        type: signedAmountMinor < 0 ? 'expense' : 'income',
        updatedAt: timestamp
    };
}

function parseCsvAmountMinor(value: string): number {
    const normalizedValue = value
        .replace(/[\s\u00A0\u202F]/g, '')
        .replace(',', '.');
    const amount = Number(normalizedValue);

    if (!Number.isFinite(amount)) {
        throw new Error(`Invalid operation amount: ${value}`);
    }

    return amountToMinorUnits(amount);
}

function parseCsvDate(value: string): string {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());

    if (!match) {
        throw new Error(`Invalid operation date: ${value}`);
    }

    return `${match[3]}-${match[2]}-${match[1]}`;
}

function normalizeText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

function normalizeCsvQuotes(value: string): string {
    return value.replace(/""/g, '"');
}

function createStableEntityId(prefix: string, value: string): string {
    let hash = 2_166_136_261;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }

    return `${prefix}-imported-${(hash >>> 0).toString(36)}`;
}

function isCsvOperationRecord(value: unknown): value is CsvOperationRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;

    return typeof record['Дата'] === 'string'
        && typeof record['Сумма'] === 'string'
        && typeof record['Название'] === 'string'
        && typeof record['Получатель/Плательщик'] === 'string'
        && typeof record['IBAN контакта'] === 'string'
        && typeof record['Категория'] === 'string'
        && typeof record['Комментарий'] === 'string';
}
