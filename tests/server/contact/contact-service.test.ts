import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    createContactInputSchema,
    updateContactInputSchema
} from '~/entities/contact';
import {
    ContactNameConflictError,
    ContactNotFoundError,
    ContactVersionConflictError
} from '~/server/contact/contact-errors';
import { createContactRepository } from '~/server/contact/contact-repository';
import {
    type ContactService,
    createContactService
} from '~/server/contact/contact-service';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    householdMembers,
    households,
    users
} from '~/server/db/schema';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { AccentColor, CurrencyCode } from '~/shared/lib';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-07-24T10:00:00.000Z');

const validCreateInput = createContactInputSchema.parse({
    color: AccentColor.BLUE,
    legalName: null,
    name: 'Алексей Иванов',
    type: 'person'
});

let connection: Database.Database;
let database: AppDatabase;
let contactService: ContactService;
let contactSequence: number;

/**
 * Creates the service under test from repositories backed by the memory DB.
 */
function createTestContactService(): ContactService {
    return createContactService({
        contactRepository: createContactRepository(database),
        createId: () => `contact-${contactSequence++}`,
        householdResolver: createHouseholdResolver(
            createHouseholdRepository(database),
            { now: () => new Date(FIXED_DATE) }
        ),
        now: () => new Date(FIXED_DATE)
    });
}

beforeEach(async () => {
    connection = new Database(':memory:');
    connection.pragma('foreign_keys = ON');
    database = drizzle(connection, { schema });
    migrate(database, { migrationsFolder: './drizzle' });
    contactSequence = 1;

    await database.insert(users).values({
        createdAt: FIXED_DATE,
        displayName: 'Sergei Test',
        id: USER_ID,
        isActive: true,
        passwordHash: 'hash',
        updatedAt: FIXED_DATE,
        username: 'sergei'
    });
    await database.insert(households).values({
        baseCurrency: CurrencyCode.BYN,
        createdAt: FIXED_DATE,
        id: HOUSEHOLD_ID,
        name: 'Семья',
        updatedAt: FIXED_DATE
    });
    await database.insert(householdMembers).values({
        householdId: HOUSEHOLD_ID,
        joinedAt: FIXED_DATE,
        role: 'owner',
        userId: USER_ID
    });

    contactService = createTestContactService();
});

afterEach(() => {
    connection.close();
});

describe('contact service persistence', () => {
    it('creates and lists a contact in the household base currency', async () => {
        const created = await contactService.create(USER_ID, validCreateInput);
        const collection = await contactService.list(USER_ID, 'active');

        expect(created).toMatchObject({
            archivedAt: null,
            id: 'contact-1',
            legalName: null,
            name: 'Алексей Иванов',
            type: 'person',
            version: 1
        });
        expect(collection).toEqual({
            baseCurrency: CurrencyCode.BYN,
            items: [created]
        });
    });

    it('rejects duplicate normalized names within one household', async () => {
        await contactService.create(USER_ID, validCreateInput);

        await expect(contactService.create(USER_ID, {
            ...validCreateInput,
            name: '  АЛЕКСЕЙ   ИВАНОВ  '
        })).rejects.toBeInstanceOf(ContactNameConflictError);
    });

    it('stores a company legal name and clears it after changing to person', async () => {
        const company = await contactService.create(USER_ID, {
            color: AccentColor.GREEN,
            legalName: '  ООО   Легкий ужин ',
            name: 'Пицца Лисица',
            type: 'company'
        });
        const person = await contactService.update(
            USER_ID,
            updateContactInputSchema.parse({
                color: company.color,
                id: company.id,
                legalName: company.legalName,
                name: company.name,
                type: 'person',
                version: company.version
            })
        );

        expect(company.legalName).toBe('ООО Легкий ужин');
        expect(person).toMatchObject({
            legalName: null,
            type: 'person',
            version: 2
        });
    });

    it('archives, filters and restores using optimistic locking', async () => {
        const created = await contactService.create(USER_ID, validCreateInput);
        const archived = await contactService.archive(USER_ID, {
            id: created.id,
            version: created.version
        });

        expect(archived.archivedAt).toBe(FIXED_DATE.toISOString());
        await expect(contactService.list(USER_ID, 'active'))
            .resolves
            .toMatchObject({ items: [] });
        await expect(contactService.list(USER_ID, 'archived'))
            .resolves
            .toMatchObject({ items: [archived] });
        await expect(contactService.update(
            USER_ID,
            updateContactInputSchema.parse({
                ...validCreateInput,
                id: archived.id,
                version: created.version
            })
        )).rejects.toBeInstanceOf(ContactVersionConflictError);

        const restored = await contactService.restore(USER_ID, {
            id: archived.id,
            version: archived.version
        });

        expect(restored).toMatchObject({
            archivedAt: null,
            version: 3
        });
    });

    it('does not expose a contact owned by another household', async () => {
        await database.insert(users).values({
            createdAt: FIXED_DATE,
            displayName: 'Other User',
            id: 'user-2',
            isActive: true,
            passwordHash: 'hash',
            updatedAt: FIXED_DATE,
            username: 'other'
        });
        await database.insert(households).values({
            baseCurrency: CurrencyCode.USD,
            createdAt: FIXED_DATE,
            id: 'household-2',
            name: 'Другая семья',
            updatedAt: FIXED_DATE
        });
        await database.insert(householdMembers).values({
            householdId: 'household-2',
            joinedAt: FIXED_DATE,
            role: 'owner',
            userId: 'user-2'
        });

        const otherContact = await contactService.create(
            'user-2',
            validCreateInput
        );

        await expect(contactService.update(
            USER_ID,
            updateContactInputSchema.parse({
                ...validCreateInput,
                id: otherContact.id,
                version: otherContact.version
            })
        )).rejects.toBeInstanceOf(ContactNotFoundError);
    });

    it('reserves the unknown type for the future import pipeline', () => {
        expect(createContactInputSchema.safeParse({
            ...validCreateInput,
            type: 'unknown'
        }).success).toBe(false);
    });
});
