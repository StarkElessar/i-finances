import {
    eq,
    sql
} from 'drizzle-orm';

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

type CliOptions = {
    apply: boolean;
    username?: string;
};

type ContactRow = {
    id: string;
    name: string;
    type: string;
};

const ALLOWED_OPTIONS = new Set(['apply', 'dry-run', 'username']);
const PERSON_LIKE_CONTACTS = [
    'Алексей Зинович',
    'Артем Клюенков',
    'бабуля Наташ Нижникова',
    'бабушка Люба',
    'Дима Ракович',
    'Егор Ковшик',
    'Мама',
    'Марина Бутя',
    'Мария',
    'Сан Саныч',
    'Сергей Черевако',
    'сестра Олька Гончаренко',
    'Соколовский Дмитрий',
    'Сушко Светлана Евгеньевна',
    'Тёща',
    'Частный инструктор'
] as const;

const PERSON_LIKE_IDENTITIES = new Set(
    PERSON_LIKE_CONTACTS.map(normalizeContactIdentity)
);

function parseCliOptions(arguments_: readonly string[]): CliOptions {
    const normalizedArguments = arguments_[0] === '--'
        ? arguments_.slice(1)
        : arguments_;
    const options: CliOptions = {
        apply: false
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

        if (name === 'username') {
            options.username = value;
        }

        index += 1;
    }

    return options;
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
                ? 'No household member was found for contact classification.'
                : `User "${username}" does not belong to a household.`
        );
    }

    if (selectedUsers.length > 1) {
        throw new Error('Several household users match the input. Pass --username.');
    }

    return selectedUsers[0];
}

function isPersonLikeContact(name: string): boolean {
    return PERSON_LIKE_IDENTITIES.has(normalizeContactIdentity(name));
}

function getHouseholdContacts(householdId: string): ContactRow[] {
    return db.select({
        id: contacts.id,
        name: contacts.name,
        type: contacts.type
    })
        .from(contacts)
        .where(eq(contacts.householdId, householdId))
        .orderBy(contacts.normalizedName)
        .all();
}

function classifyContacts(options: CliOptions): void {
    const importUser = getImportUser(options.username);
    const contactRows = getHouseholdContacts(importUser.householdId);
    const unknownContacts = contactRows.filter((contact) => contact.type === 'unknown');
    const contactsToMarkAsCompany = unknownContacts.filter((contact) => {
        return !isPersonLikeContact(contact.name);
    });
    const contactsToLeaveUnknown = unknownContacts.filter((contact) => {
        return isPersonLikeContact(contact.name);
    });

    console.warn(`Scanned ${contactRows.length} contacts.`);
    console.warn(`Unknown contacts: ${unknownContacts.length}.`);
    console.warn(`Contacts to mark as company: ${contactsToMarkAsCompany.length}.`);
    console.warn(`Person-like contacts left unchanged: ${contactsToLeaveUnknown.length}.`);

    if (contactsToMarkAsCompany.length > 0) {
        console.warn(
            `Companies: ${contactsToMarkAsCompany.map((contact) => contact.name).join(', ')}.`
        );
    }

    if (contactsToLeaveUnknown.length > 0) {
        console.warn(
            `Left unchanged: ${contactsToLeaveUnknown.map((contact) => contact.name).join(', ')}.`
        );
    }

    if (!options.apply) {
        console.warn('Dry-run only. Pass --apply to update contacts.');
        return;
    }

    const timestamp = new Date();

    db.transaction((transaction) => {
        contactsToMarkAsCompany.forEach((contact) => {
            const name = normalizeContactName(contact.name);

            transaction.update(contacts)
                .set({
                    legalName: null,
                    name,
                    normalizedLegalName: null,
                    normalizedName: normalizeContactIdentity(name),
                    type: 'company',
                    updatedAt: timestamp,
                    version: sql`${contacts.version} + 1`
                })
                .where(eq(contacts.id, contact.id))
                .run();
        });
    });

    console.warn(`Marked ${contactsToMarkAsCompany.length} contacts as company.`);
}

try {
    classifyContacts(parseCliOptions(process.argv.slice(2)));
}
catch (error: unknown) {
    console.error('Failed to classify iFinance contacts.', error);
    process.exitCode = 1;
}
finally {
    sqlite.close();
}
