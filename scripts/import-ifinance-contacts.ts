import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';

import {
    normalizeContactIdentity,
    normalizeContactName
} from '../src/entities/contact/model/normalization';
import { db, sqlite } from '../src/server/db/client';
import {
    contacts,
    householdMembers,
    users
} from '../src/server/db/schema';
import { AccentColor } from '../src/shared/lib';

type CliOptions = {
    apply: boolean;
    files: string[];
    username?: string;
};

type ImportedContact = {
    color: string;
    name: string;
    sourceRows: number;
};

const DEFAULT_IMPORT_FILES = [
    'public/счет "НЗ EUR".csv',
    'public/счет "НЗ USD".csv',
    'public/счет "Наличные".csv',
    'public/счет "USDT ByBit".csv'
];
const ALLOWED_OPTIONS = new Set(['apply', 'dry-run', 'file', 'username']);
const MAX_CONTACT_NAME_LENGTH = 120;

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

function normalizeImportedContactName(value: string): string {
    return normalizeContactName(value.replace(/""/g, '"'));
}

function findCsvHeaderIndex(lines: readonly string[], filePath: string): number {
    const headerIndex = lines.findIndex((line) => line.startsWith('Дата;Сумма;'));

    if (headerIndex < 0) {
        throw new Error(`CSV header was not found in "${filePath}".`);
    }

    return headerIndex;
}

function parseContactNamesFromCsv(filePath: string): string[] {
    const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);
    const headerIndex = findCsvHeaderIndex(lines, filePath);
    const records = parse(lines.slice(headerIndex).join('\n'), {
        bom: true,
        columns: true,
        delimiter: ';',
        relax_quotes: true,
        skip_empty_lines: true
    }) as Array<Record<string, string>>;

    return records.map((record) => {
        return normalizeImportedContactName(record['Получатель/Плательщик'] ?? '');
    });
}

function getImportedContacts(filePaths: readonly string[]): {
    blankRows: number;
    contacts: ImportedContact[];
    rowCount: number;
} {
    const contactsByIdentity = new Map<string, ImportedContact>();
    let blankRows = 0;
    let rowCount = 0;

    filePaths.forEach((filePath) => {
        const contactNames = parseContactNamesFromCsv(resolve(filePath));

        contactNames.forEach((name) => {
            rowCount += 1;

            if (name.length === 0) {
                blankRows += 1;
                return;
            }

            if (name.length > MAX_CONTACT_NAME_LENGTH) {
                throw new Error(
                    `Contact name is longer than ${MAX_CONTACT_NAME_LENGTH} characters: "${name}".`
                );
            }

            const identity = normalizeContactIdentity(name);
            const existingContact = contactsByIdentity.get(identity);

            if (
                existingContact !== undefined
                && existingContact.name !== name
            ) {
                throw new Error(
                    `Contact name conflict after normalization: "${existingContact.name}" and "${name}".`
                );
            }

            contactsByIdentity.set(identity, {
                color: getStableContactColor(identity),
                name,
                sourceRows: (existingContact?.sourceRows ?? 0) + 1
            });
        });
    });

    return {
        blankRows,
        contacts: [...contactsByIdentity.values()]
            .sort((left, right) => left.name.localeCompare(right.name, 'ru')),
        rowCount
    };
}

function getStableContactColor(identity: string): string {
    const palette = AccentColor.values();
    let hash = 0;

    for (const character of identity) {
        hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
    }

    return palette[hash % palette.length];
}

function getImportUser(username?: string) {
    const selectedUsers = db.select({
        householdId: householdMembers.householdId,
        userId: users.id,
        username: users.username
    })
        .from(users)
        .innerJoin(householdMembers, eq(householdMembers.userId, users.id))
        .where(username === undefined ? undefined : eq(users.username, username))
        .limit(2)
        .all();

    if (selectedUsers.length === 0) {
        throw new Error(
            username === undefined
                ? 'No household member was found for contact import.'
                : `User "${username}" does not belong to a household.`
        );
    }

    if (selectedUsers.length > 1) {
        throw new Error('Several household users match the import input. Pass --username.');
    }

    return selectedUsers[0];
}

function getExistingContactIdentities(householdId: string): Set<string> {
    const rows = db.select({ normalizedName: contacts.normalizedName })
        .from(contacts)
        .where(eq(contacts.householdId, householdId))
        .all();

    return new Set(rows.map((row) => row.normalizedName));
}

function importContacts(options: CliOptions): void {
    const importUser = getImportUser(options.username);
    const imported = getImportedContacts(options.files);
    const existingIdentities = getExistingContactIdentities(importUser.householdId);
    const contactsToCreate = imported.contacts.filter((contact) => {
        return !existingIdentities.has(normalizeContactIdentity(contact.name));
    });
    const skippedContacts = imported.contacts.filter((contact) => {
        return existingIdentities.has(normalizeContactIdentity(contact.name));
    });

    console.warn(`Scanned ${imported.rowCount} CSV rows from ${options.files.length} files.`);
    console.warn(`Blank contact rows skipped: ${imported.blankRows}.`);
    console.warn(`Parsed ${imported.contacts.length} unique contacts.`);
    console.warn(`Existing contacts skipped: ${skippedContacts.length}.`);
    console.warn(`Contacts to create: ${contactsToCreate.length}.`);

    if (contactsToCreate.length > 0) {
        console.warn(
            `Contacts: ${contactsToCreate.map((contact) => contact.name).join(', ')}.`
        );
    }

    if (!options.apply) {
        console.warn('Dry-run only. Pass --apply to write contacts.');
        return;
    }

    const timestamp = new Date();

    db.transaction((transaction) => {
        contactsToCreate.forEach((contact) => {
            transaction.insert(contacts)
                .values({
                    archivedAt: null,
                    color: contact.color,
                    createdAt: timestamp,
                    createdByUserId: importUser.userId,
                    householdId: importUser.householdId,
                    id: randomUUID(),
                    legalName: null,
                    name: contact.name,
                    normalizedLegalName: null,
                    normalizedName: normalizeContactIdentity(contact.name),
                    type: 'unknown',
                    updatedAt: timestamp,
                    version: 1
                })
                .run();
        });
    });

    console.warn(`Imported ${contactsToCreate.length} contacts.`);
}

try {
    importContacts(parseCliOptions(process.argv.slice(2)));
}
catch (error: unknown) {
    console.error('Failed to import iFinance contacts.', error);
    process.exitCode = 1;
}
finally {
    sqlite.close();
}
