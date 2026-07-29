import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'csv-parse/sync';
import {
    eq,
    inArray,
    sql
} from 'drizzle-orm';

import {
    normalizeCategoryIdentity,
    normalizeCategoryName
} from '../src/entities/category/model/normalization';
import {
    normalizeContactIdentity,
    normalizeContactName
} from '../src/entities/contact/model/normalization';
import {
    normalizeOperationComment,
    normalizeOperationTitle
} from '../src/entities/operation/model/normalization';
import { db, sqlite } from '../src/server/db/client';
import {
    accounts,
    categories,
    contacts,
    householdMembers,
    households,
    operations,
    users
} from '../src/server/db/schema';
import {
    formatMinorUnitsCurrency,
    minorUnitsToAmount
} from '../src/shared/lib';

import type { OperationType } from '../src/entities/operation/model/types';
import type {
    AccountRecord,
    CategoryRecord,
    ContactRecord
} from '../src/server/db/schema';
import type { CurrencyCodeValue } from '../src/shared/lib';

type CliOptions = {
    apply: boolean;
    files: string[];
    username?: string;
};

type CsvRecord = Record<string, string>;

type ParsedCsvOperation = {
    accountCsvName: string;
    amountMinor: number;
    categoryName: string;
    comment: string;
    contactName: string | null;
    happenedOn: string;
    rowNumber: number;
    sourceFile: string;
    title: string;
    type: OperationType;
};

type ImportableOperation = ParsedCsvOperation & {
    account: AccountRecord;
    amountInHouseholdBaseCurrencyMinor: number;
    category: CategoryRecord;
    contact: ContactRecord | null;
    exchangeRate: string;
    exchangeRateSource: string;
    householdBaseCurrency: CurrencyCodeValue;
    id: string;
    type: OperationType;
};

type SkippedOperation = {
    accountCsvName: string;
    amountMinor: number;
    happenedOn: string;
    reason: string;
    rowNumber: number;
    sourceFile: string;
    title: string;
};

type AccountImportSummary = {
    accountName: string;
    currency: CurrencyCodeValue;
    existingBalanceMinor: number;
    expenseMinor: number;
    incomeMinor: number;
    projectedBalanceMinor: number;
    toCreate: number;
};

const DEFAULT_IMPORT_FILES = [
    'public/счет "НЗ EUR".csv',
    'public/счет "НЗ USD".csv',
    'public/счет "Наличные".csv',
    'public/счет "USDT ByBit".csv'
];
const ACCOUNT_NAME_MAP = new Map<string, string>([
    ['Наличные', 'Общая наличка']
]);
const ALLOWED_OPTIONS = new Set(['apply', 'dry-run', 'file', 'username']);
const DEFAULT_CATEGORY_NAME = 'Неучтенка';
const IMPORT_ID_PREFIX = 'ifinance';
const IMPORT_EXCHANGE_RATE_SOURCE = 'ifinance-import-account-currency';
const MAX_OPERATION_TITLE_LENGTH = 160;
const MAX_OPERATION_COMMENT_LENGTH = 1000;

function parseCliOptions(arguments_: readonly string[]): CliOptions {
    const normalizedArguments = arguments_[0] === '--'
        ? arguments_.slice(1)
        : arguments_;
    const options: CliOptions = {
        apply: false,
        files: []
    };

    for (let index = 0; index < normalizedArguments.length; index += 1) {
        const option = normalizedArguments[index];

        if (!option.startsWith('--')) {
            throw new Error(`Unexpected positional argument: ${option}.`);
        }

        const name = option.slice(2);

        if (!ALLOWED_OPTIONS.has(name)) {
            throw new Error(`Unknown option: --${name}.`);
        }

        if (name === 'apply') {
            options.apply = true;
            continue;
        }

        if (name === 'dry-run') {
            options.apply = false;
            continue;
        }

        const value = normalizedArguments[index + 1];

        if (value === undefined || value.startsWith('--')) {
            throw new Error(`Option --${name} requires a value.`);
        }

        if (name === 'file') {
            options.files.push(value);
        }

        if (name === 'username') {
            options.username = value;
        }

        index += 1;
    }

    return {
        ...options,
        files: options.files.length > 0 ? options.files : DEFAULT_IMPORT_FILES
    };
}

function getImportUser(username?: string) {
    const selectedUsers = db.select({
        baseCurrency: households.baseCurrency,
        householdId: householdMembers.householdId,
        userId: users.id,
        username: users.username
    })
        .from(users)
        .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
        .innerJoin(households, eq(households.id, householdMembers.householdId))
        .where(username === undefined ? undefined : eq(users.username, username))
        .limit(2)
        .all();

    if (selectedUsers.length === 0) {
        throw new Error(
            username === undefined
                ? 'No household member was found for operation import.'
                : `User "${username}" does not belong to a household.`
        );
    }

    if (selectedUsers.length > 1) {
        throw new Error('Several household users match the import input. Pass --username.');
    }

    return selectedUsers[0];
}

function findCsvHeaderIndex(lines: readonly string[], filePath: string): number {
    const headerIndex = lines.findIndex((line) => line.startsWith('Дата;Сумма;'));

    if (headerIndex < 0) {
        throw new Error(`CSV header was not found in "${filePath}".`);
    }

    return headerIndex;
}

function parseAccountName(lines: readonly string[], filePath: string): string {
    const accountLine = lines.find((line) => line.startsWith('Счёт:'));

    if (accountLine === undefined) {
        throw new Error(`Account line was not found in "${filePath}".`);
    }

    return normalizeOperationTitle(accountLine.replace(/^Счёт:\s*/, ''));
}

function parseCsvRecords(filePath: string): {
    accountCsvName: string;
    headerIndex: number;
    records: CsvRecord[];
} {
    const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);
    const headerIndex = findCsvHeaderIndex(lines, filePath);

    return {
        accountCsvName: parseAccountName(lines, filePath),
        headerIndex,
        records: parse(lines.slice(headerIndex).join('\n'), {
            bom: true,
            columns: true,
            delimiter: ';',
            relax_quotes: true,
            skip_empty_lines: true
        }) as CsvRecord[]
    };
}

function parseSignedAmountMinor(value: string): number {
    const normalizedValue = value
        .replace(/[\s\u00A0\u202F]/g, '')
        .replace(',', '.');
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalizedValue);

    if (match === null) {
        throw new Error(`Invalid money amount: "${value}".`);
    }

    const sign = match[1] === '-' ? -1 : 1;
    const wholePart = Number(match[2]);
    const fractionPart = Number((match[3] ?? '').padEnd(2, '0'));

    return sign * (wholePart * 100 + fractionPart);
}

function parseLocalDate(value: string): string {
    const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());

    if (match === null) {
        throw new Error(`Invalid operation date: "${value}".`);
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        throw new Error(`Operation date does not exist: "${value}".`);
    }

    return `${year}-${match[2]}-${match[1]}`;
}

function normalizeImportedContactName(value: string): string | null {
    const name = normalizeContactName(value.replace(/""/g, '"'));

    return name.length > 0 ? name : null;
}

function flattenCategoryName(value: string): string {
    const normalizedValue = normalizeCategoryName(value);

    if (normalizedValue.length === 0) {
        return DEFAULT_CATEGORY_NAME;
    }

    return normalizeCategoryName(
        normalizedValue.split(':').at(-1) ?? normalizedValue
    );
}

function createComment(record: CsvRecord): string {
    const comment = normalizeOperationComment(record['Комментарий'] ?? '');
    const receiptNumber = normalizeOperationComment(record['Номер чека'] ?? '');
    const parts = [
        comment,
        receiptNumber.length > 0 ? `Номер чека: ${receiptNumber}` : ''
    ].filter((part) => part.length > 0);

    return parts.join('\n');
}

function parseCsvOperations(filePaths: readonly string[]): {
    operations: ParsedCsvOperation[];
    skipped: SkippedOperation[];
    totalRows: number;
} {
    const importFingerprints = new Set<string>();
    const parsedOperations: ParsedCsvOperation[] = [];
    const skippedOperations: SkippedOperation[] = [];
    let totalRows = 0;

    filePaths.forEach((filePath) => {
        const resolvedFilePath = resolve(filePath);
        const { accountCsvName, headerIndex, records } = parseCsvRecords(resolvedFilePath);

        records.forEach((record, index) => {
            totalRows += 1;

            const rowNumber = headerIndex + index + 2;
            const amountMinor = parseSignedAmountMinor(record['Сумма'] ?? '');
            const happenedOn = parseLocalDate(record['Дата'] ?? '');
            const title = normalizeOperationTitle(record['Название'] ?? '');
            const categoryName = flattenCategoryName(record['Категория'] ?? '');
            const contactName = normalizeImportedContactName(
                record['Получатель/Плательщик'] ?? ''
            );
            const comment = createComment(record);

            if (amountMinor === 0) {
                skippedOperations.push({
                    accountCsvName,
                    amountMinor,
                    happenedOn,
                    reason: 'zero-amount',
                    rowNumber,
                    sourceFile: resolvedFilePath,
                    title
                });
                return;
            }

            const unsignedAmountMinor = Math.abs(amountMinor);

            if (title.length === 0) {
                throw new Error(
                    `Operation title is empty in "${resolvedFilePath}" row ${rowNumber}.`
                );
            }

            if (title.length > MAX_OPERATION_TITLE_LENGTH) {
                throw new Error(
                    `Operation title is longer than ${MAX_OPERATION_TITLE_LENGTH} characters in "${resolvedFilePath}" row ${rowNumber}.`
                );
            }

            if (comment.length > MAX_OPERATION_COMMENT_LENGTH) {
                throw new Error(
                    `Operation comment is longer than ${MAX_OPERATION_COMMENT_LENGTH} characters in "${resolvedFilePath}" row ${rowNumber}.`
                );
            }

            const importFingerprint = createImportFingerprint({
                accountCsvName,
                amountMinor,
                categoryName,
                comment,
                contactName,
                happenedOn,
                title
            });

            if (importFingerprints.has(importFingerprint)) {
                skippedOperations.push({
                    accountCsvName,
                    amountMinor: unsignedAmountMinor,
                    happenedOn,
                    reason: 'duplicate-row',
                    rowNumber,
                    sourceFile: resolvedFilePath,
                    title
                });
                return;
            }

            importFingerprints.add(importFingerprint);
            parsedOperations.push({
                accountCsvName,
                amountMinor: unsignedAmountMinor,
                categoryName,
                comment,
                contactName,
                happenedOn,
                rowNumber,
                sourceFile: resolvedFilePath,
                title,
                type: amountMinor < 0 ? 'expense' : 'income'
            });
        });
    });

    return {
        operations: parsedOperations,
        skipped: skippedOperations,
        totalRows
    };
}

function createImportFingerprint(input: {
    accountCsvName: string;
    amountMinor: number;
    categoryName: string;
    comment: string;
    contactName: string | null;
    happenedOn: string;
    title: string;
}): string {
    return [
        input.accountCsvName,
        input.happenedOn,
        input.amountMinor.toString(),
        input.title,
        input.contactName ?? '',
        input.categoryName,
        input.comment
    ].join('|');
}

function createImportOperationId(importFingerprint: string): string {
    const hash = createHash('sha256')
        .update(importFingerprint)
        .digest('hex')
        .slice(0, 32);

    return `${IMPORT_ID_PREFIX}-${hash}`;
}

function getAccountLookup(householdId: string): Map<string, AccountRecord> {
    const rows = db.select()
        .from(accounts)
        .where(eq(accounts.householdId, householdId))
        .all();

    return new Map(rows.map((account) => [account.name, account]));
}

function getCategoryLookup(householdId: string): Map<string, CategoryRecord> {
    const rows = db.select()
        .from(categories)
        .where(eq(categories.householdId, householdId))
        .all();

    return new Map(rows.map((category) => [category.normalizedName, category]));
}

function getContactLookup(householdId: string): Map<string, ContactRecord> {
    const rows = db.select()
        .from(contacts)
        .where(eq(contacts.householdId, householdId))
        .all();

    return new Map(rows.map((contact) => [contact.normalizedName, contact]));
}

function resolveImportableOperations(
    householdId: string,
    householdBaseCurrency: CurrencyCodeValue,
    parsedOperations: readonly ParsedCsvOperation[]
): ImportableOperation[] {
    const accountLookup = getAccountLookup(householdId);
    const categoryLookup = getCategoryLookup(householdId);
    const contactLookup = getContactLookup(householdId);
    const importableOperations: ImportableOperation[] = [];
    const errors: string[] = [];

    parsedOperations.forEach((operation) => {
        const mappedAccountName = ACCOUNT_NAME_MAP.get(operation.accountCsvName)
            ?? operation.accountCsvName;
        const account = accountLookup.get(mappedAccountName);
        const category = categoryLookup.get(
            normalizeCategoryIdentity(operation.categoryName)
        );
        const contact = operation.contactName === null
            ? null
            : contactLookup.get(normalizeContactIdentity(operation.contactName));
        const importFingerprint = createImportFingerprint({
            accountCsvName: operation.accountCsvName,
            amountMinor: operation.type === 'expense'
                ? -operation.amountMinor
                : operation.amountMinor,
            categoryName: operation.categoryName,
            comment: operation.comment,
            contactName: operation.contactName,
            happenedOn: operation.happenedOn,
            title: operation.title
        });

        if (account === undefined) {
            errors.push(
                `${operation.sourceFile}:${operation.rowNumber}: account "${operation.accountCsvName}" is not mapped to an existing account.`
            );
            return;
        }

        if (category === undefined) {
            errors.push(
                `${operation.sourceFile}:${operation.rowNumber}: category "${operation.categoryName}" was not found.`
            );
            return;
        }

        if (operation.contactName !== null && contact === undefined) {
            errors.push(
                `${operation.sourceFile}:${operation.rowNumber}: contact "${operation.contactName}" was not found.`
            );
            return;
        }

        importableOperations.push({
            ...operation,
            account,
            amountInHouseholdBaseCurrencyMinor: operation.amountMinor,
            category,
            contact: contact ?? null,
            exchangeRate: '1',
            exchangeRateSource: account.currency === householdBaseCurrency
                ? 'identity'
                : IMPORT_EXCHANGE_RATE_SOURCE,
            householdBaseCurrency,
            id: createImportOperationId(importFingerprint),
            type: operation.type
        });
    });

    if (errors.length > 0) {
        throw new Error([
            'Operation import cannot continue because some references are missing.',
            ...errors.slice(0, 30),
            errors.length > 30 ? `...and ${errors.length - 30} more errors.` : ''
        ].filter(Boolean).join('\n'));
    }

    return importableOperations;
}

function getExistingImportedOperationIds(
    operationIds: readonly string[]
): Set<string> {
    if (operationIds.length === 0) {
        return new Set();
    }

    const rows = db.select({ id: operations.id })
        .from(operations)
        .where(inArray(operations.id, [...operationIds]))
        .all();

    return new Set(rows.map((row) => row.id));
}

function getExistingAccountBalances(
    householdId: string
): Map<string, number> {
    const rows = db.select({
        accountId: accounts.id,
        balanceMinor: sql<number>`
            ${accounts.initialBalanceMinor}
            + coalesce(sum(
                case
                    when ${operations.type} = 'expense'
                        then -${operations.amountMinor}
                    else ${operations.amountMinor}
                end
            ), 0)
        `.mapWith(Number)
    })
        .from(accounts)
        .leftJoin(
            operations,
            sql`
                ${operations.accountId} = ${accounts.id}
                and ${operations.deletedAt} is null
            `
        )
        .where(eq(accounts.householdId, householdId))
        .groupBy(accounts.id)
        .all();

    return new Map(rows.map((row) => [row.accountId, row.balanceMinor]));
}

function createImportSummary(
    householdId: string,
    operationsToCreate: readonly ImportableOperation[]
): AccountImportSummary[] {
    const existingBalances = getExistingAccountBalances(householdId);
    const summaries = new Map<string, AccountImportSummary>();

    operationsToCreate.forEach((operation) => {
        const summary = summaries.get(operation.account.id) ?? {
            accountName: operation.account.name,
            currency: operation.account.currency,
            existingBalanceMinor: existingBalances.get(operation.account.id) ?? 0,
            expenseMinor: 0,
            incomeMinor: 0,
            projectedBalanceMinor: existingBalances.get(operation.account.id) ?? 0,
            toCreate: 0
        };

        if (operation.type === 'income') {
            summary.incomeMinor += operation.amountMinor;
            summary.projectedBalanceMinor += operation.amountMinor;
        }
        else {
            summary.expenseMinor += operation.amountMinor;
            summary.projectedBalanceMinor -= operation.amountMinor;
        }

        summary.toCreate += 1;
        summaries.set(operation.account.id, summary);
    });

    return [...summaries.values()]
        .sort((left, right) => left.accountName.localeCompare(right.accountName, 'ru'));
}

function printImportSummary(summaries: readonly AccountImportSummary[]): void {
    summaries.forEach((summary) => {
        console.warn(
            [
                `${summary.accountName}: ${summary.toCreate} operations`,
                `income ${formatMinorUnitsCurrency(summary.incomeMinor, summary.currency)}`,
                `expense ${formatMinorUnitsCurrency(summary.expenseMinor, summary.currency)}`,
                `balance ${formatMinorUnitsCurrency(summary.existingBalanceMinor, summary.currency)}`,
                `projected ${formatMinorUnitsCurrency(summary.projectedBalanceMinor, summary.currency)}`
            ].join('; ')
        );
    });
}

function printSkippedOperations(skippedOperations: readonly SkippedOperation[]): void {
    if (skippedOperations.length === 0) {
        return;
    }

    console.warn('Skipped rows:');
    skippedOperations.forEach((operation) => {
        console.warn(
            [
                `${operation.sourceFile}:${operation.rowNumber}`,
                operation.accountCsvName,
                operation.happenedOn,
                operation.reason,
                `${minorUnitsToAmount(operation.amountMinor).toFixed(2)}`,
                operation.title
            ].join(' | ')
        );
    });
}

function getNextSourceOrder(
    transaction: Parameters<Parameters<typeof db.transaction>[0]>[0],
    sourceOrderByAccountDate: Map<string, number>,
    accountId: string,
    happenedOn: string
): number {
    const key = `${accountId}|${happenedOn}`;
    const currentSourceOrder = sourceOrderByAccountDate.get(key);

    if (currentSourceOrder !== undefined) {
        sourceOrderByAccountDate.set(key, currentSourceOrder + 1);
        return currentSourceOrder;
    }

    const result = transaction.select({
        sourceOrder: sql<number | null>`max(${operations.sourceOrder})`
            .mapWith(Number)
    })
        .from(operations)
        .where(sql`
            ${operations.accountId} = ${accountId}
            and ${operations.happenedOn} = ${happenedOn}
        `)
        .get();
    const nextSourceOrder = (result?.sourceOrder ?? -1) + 1;

    sourceOrderByAccountDate.set(key, nextSourceOrder + 1);
    return nextSourceOrder;
}

function insertOperations(
    importUser: {
        householdId: string;
        userId: string;
    },
    operationsToCreate: readonly ImportableOperation[]
): void {
    const timestamp = new Date();

    db.transaction((transaction) => {
        const sourceOrderByAccountDate = new Map<string, number>();

        operationsToCreate.forEach((operation) => {
            transaction.insert(operations)
                .values({
                    accountId: operation.account.id,
                    amountInHouseholdBaseCurrencyMinor:
                        operation.amountInHouseholdBaseCurrencyMinor,
                    amountMinor: operation.amountMinor,
                    categoryId: operation.category.id,
                    categoryNameSnapshot: operation.category.name,
                    comment: operation.comment,
                    contactId: operation.contact?.id ?? null,
                    contactNameSnapshot: operation.contact?.name ?? null,
                    createdAt: timestamp,
                    createdByUserId: importUser.userId,
                    currency: operation.account.currency,
                    deletedAt: null,
                    deletedByUserId: null,
                    exchangeRate: operation.exchangeRate,
                    exchangeRateEffectiveOn: operation.happenedOn,
                    exchangeRateSource: operation.exchangeRateSource,
                    happenedOn: operation.happenedOn,
                    householdBaseCurrency: operation.householdBaseCurrency,
                    householdId: importUser.householdId,
                    id: operation.id,
                    sourceOrder: getNextSourceOrder(
                        transaction,
                        sourceOrderByAccountDate,
                        operation.account.id,
                        operation.happenedOn
                    ),
                    title: operation.title,
                    type: operation.type,
                    updatedAt: timestamp,
                    updatedByUserId: importUser.userId,
                    version: 1
                })
                .run();
        });
    });
}

function importOperations(options: CliOptions): void {
    const importUser = getImportUser(options.username);
    const parsed = parseCsvOperations(options.files);
    const resolvedOperations = resolveImportableOperations(
        importUser.householdId,
        importUser.baseCurrency,
        parsed.operations
    );
    const existingImportedOperationIds = getExistingImportedOperationIds(
        resolvedOperations.map((operation) => operation.id)
    );
    const existingImportSkipped = resolvedOperations.filter((operation) => {
        return existingImportedOperationIds.has(operation.id);
    });
    const operationsToCreate = resolvedOperations.filter((operation) => {
        return !existingImportedOperationIds.has(operation.id);
    });

    console.warn(`Scanned ${parsed.totalRows} CSV rows from ${options.files.length} files.`);
    console.warn(`Parsed non-zero unique operations: ${resolvedOperations.length}.`);
    console.warn(`Skipped before DB lookup: ${parsed.skipped.length}.`);
    console.warn(`Already imported operations skipped: ${existingImportSkipped.length}.`);
    console.warn(`Operations to create: ${operationsToCreate.length}.`);
    printSkippedOperations(parsed.skipped);
    printImportSummary(createImportSummary(importUser.householdId, operationsToCreate));

    if (!options.apply) {
        console.warn('Dry-run only. Pass --apply to write operations.');
        return;
    }

    insertOperations(importUser, operationsToCreate);
    console.warn(`Imported ${operationsToCreate.length} operations.`);
}

try {
    importOperations(parseCliOptions(process.argv.slice(2)));
}
catch (error: unknown) {
    console.error('Failed to import iFinance operations.', error);
    process.exitCode = 1;
}
finally {
    sqlite.close();
}
