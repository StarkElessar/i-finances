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

import type {
    ReceiptWorkerResult
} from '~/entities/receipt-import';
import { createAccountRepository } from '~/server/account/account-repository';
import { createCategoryRepository } from '~/server/category/category-repository';
import { createContactRepository } from '~/server/contact/contact-repository';
import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import {
    accounts,
    categories,
    categoryKeywords,
    householdMembers,
    households,
    users
} from '~/server/db/schema';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import { createExchangeRateService } from '~/server/exchange-rate/exchange-rate-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import { createHouseholdResolver } from '~/server/household/household-service';
import { createOperationRepository } from '~/server/operation/operation-repository';
import { createOperationService } from '~/server/operation/operation-service';
import type {
    ReceiptImageStorage
} from '~/server/receipt-import/receipt-image-storage';
import {
    ReceiptWorkerResultError
} from '~/server/receipt-import/receipt-import-errors';
import { createReceiptImportRepository } from '~/server/receipt-import/receipt-import-repository';
import {
    createReceiptImportService,
    type ReceiptImportService
} from '~/server/receipt-import/receipt-import-service';
import {
    AccentColor,
    AccountColor,
    AccountType,
    CurrencyCode
} from '~/shared/lib';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const ACCOUNT_ID = 'account-byn';
const CATEGORY_ID = 'category-food';
const IMAGE_BYTES = new Uint8Array([1, 2, 3, 4]);
const INITIAL_DATE = new Date('2026-07-29T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let currentDate: Date;
let idSequence: number;
let receiptImportService: ReceiptImportService;

function createMemoryImageStorage(): ReceiptImageStorage {
    const images = new Map<string, Uint8Array>();

    return {
        delete: async (storageKey) => {
            images.delete(storageKey);
        },
        read: async (storageKey) => {
            const image = images.get(storageKey);

            if (image === undefined) {
                throw new Error('Image not found.');
            }

            return image;
        },
        save: async (input) => {
            const storageKey = `${input.receiptImportId}.jpg`;

            images.set(storageKey, input.bytes);

            return {
                contentSha256: 'image-sha256',
                contentType: 'image/jpeg',
                originalName: input.originalName,
                sizeBytes: input.bytes.byteLength,
                storageKey
            };
        }
    };
}

function createWorkerResult(
    workerId = 'mac-mini-1'
): ReceiptWorkerResult {
    return {
        categorizedItems: [
            {
                categoryId: CATEGORY_ID,
                confidence: 0.98,
                itemIndex: 0
            },
            {
                categoryId: null,
                confidence: 0.55,
                itemIndex: 1
            }
        ],
        processor: {
            finishedAt: '2026-07-29T10:02:00.000Z',
            modelVersions: ['olmocr-local', 'json-local', 'category-local'],
            pipelineVersion: 'receipt-local-v1',
            startedAt: '2026-07-29T10:01:00.000Z',
            workerId
        },
        rawOcrText: 'Молоко 5.00\nШампунь 7.00\nИтого 12.00',
        receipt: {
            currency: 'BYN',
            happenedOn: '2026-07-29',
            items: [
                {
                    discountMinor: 0,
                    name: 'Молоко',
                    quantity: 1,
                    totalMinor: 500,
                    unitPriceMinor: 500
                },
                {
                    discountMinor: 0,
                    name: 'Шампунь',
                    quantity: 1,
                    totalMinor: 700,
                    unitPriceMinor: 700
                }
            ],
            merchant: {
                address: 'Минск',
                displayName: 'Магазин',
                legalName: 'ООО Магазин',
                unp: '190000000'
            },
            totalAmountMinor: 1_200
        },
        schemaVersion: 1,
        warnings: []
    };
}

async function completeFirstJob() {
    const created = await receiptImportService.createFromImage(USER_ID, {
        bytes: IMAGE_BYTES,
        contentType: 'image/jpeg',
        originalName: 'receipt.jpg'
    });
    const leased = await receiptImportService.leaseNextJob('mac-mini-1');

    if (leased === undefined) {
        throw new Error('Expected a leased job.');
    }

    const image = await receiptImportService.readImageForWorker(
        leased.processingJobId,
        leased.leaseToken
    );

    currentDate = new Date('2026-07-29T10:02:00.000Z');

    const completed = await receiptImportService.completeJob(
        leased.processingJobId,
        {
            leaseToken: leased.leaseToken,
            result: createWorkerResult()
        }
    );

    return {
        completed,
        created,
        image,
        leased
    };
}

beforeEach(async () => {
    connection = new Database(':memory:');
    connection.pragma('foreign_keys = ON');
    database = drizzle(connection, { schema });
    migrate(database, { migrationsFolder: './drizzle' });
    currentDate = new Date(INITIAL_DATE);
    idSequence = 1;

    await database.insert(users).values({
        createdAt: INITIAL_DATE,
        displayName: 'Receipt Tester',
        id: USER_ID,
        isActive: true,
        passwordHash: 'hash',
        updatedAt: INITIAL_DATE,
        username: 'receipt-tester'
    });
    await database.insert(households).values({
        baseCurrency: CurrencyCode.BYN,
        createdAt: INITIAL_DATE,
        id: HOUSEHOLD_ID,
        name: 'Семья',
        updatedAt: INITIAL_DATE
    });
    await database.insert(householdMembers).values({
        householdId: HOUSEHOLD_ID,
        joinedAt: INITIAL_DATE,
        role: 'owner',
        userId: USER_ID
    });
    await database.insert(accounts).values({
        archivedAt: null,
        color: AccountColor.BLUE,
        createdAt: INITIAL_DATE,
        createdByUserId: USER_ID,
        currency: CurrencyCode.BYN,
        description: '',
        householdId: HOUSEHOLD_ID,
        id: ACCOUNT_ID,
        initialBalanceMinor: 10_000,
        isColorAccentEnabled: true,
        isIncludedInFamilyTotal: true,
        name: 'Карта',
        type: AccountType.CARD,
        updatedAt: INITIAL_DATE,
        version: 1
    });
    await database.insert(categories).values({
        archivedAt: null,
        color: AccentColor.GREEN,
        createdAt: INITIAL_DATE,
        createdByUserId: USER_ID,
        householdId: HOUSEHOLD_ID,
        id: CATEGORY_ID,
        monthlyBudgetMinor: null,
        name: 'Продукты',
        normalizedName: 'продукты',
        updatedAt: INITIAL_DATE,
        version: 1
    });
    await database.insert(categoryKeywords).values({
        categoryId: CATEGORY_ID,
        normalizedValue: 'молоко',
        position: 0,
        value: 'молоко'
    });

    const householdResolver = createHouseholdResolver(
        createHouseholdRepository(database)
    );
    const accountRepository = createAccountRepository(database);
    const categoryRepository = createCategoryRepository(database);
    const exchangeRateResolver = createExchangeRateService({
        exchangeRateRepository: createExchangeRateRepository(database)
    });

    receiptImportService = createReceiptImportService({
        accountRepository,
        categoryRepository,
        createId: () => `receipt-sequence-${idSequence++}`,
        householdResolver,
        imageStorage: createMemoryImageStorage(),
        now: () => new Date(currentDate),
        operationService: createOperationService({
            accountRepository,
            categoryRepository,
            contactRepository: createContactRepository(database),
            createId: () => `operation-${idSequence++}`,
            exchangeRateResolver,
            householdResolver,
            now: () => new Date(currentDate),
            operationRepository: createOperationRepository(database)
        }),
        receiptImportRepository: createReceiptImportRepository(database)
    });
});

afterEach(() => {
    connection.close();
});

describe('receipt import service', () => {
    it('creates a queued job with the current category snapshot', async () => {
        const created = await receiptImportService.createFromImage(USER_ID, {
            bytes: IMAGE_BYTES,
            contentType: 'image/jpeg',
            originalName: 'receipt.jpg'
        });
        const imports = await receiptImportService.list(USER_ID);

        expect(created).toEqual({
            id: 'receipt-sequence-1',
            status: 'queued'
        });
        expect(imports).toHaveLength(1);
        expect(imports[0]).toMatchObject({
            categories: [{
                id: CATEGORY_ID,
                keywords: ['молоко'],
                name: 'Продукты'
            }],
            imageOriginalName: 'receipt.jpg',
            status: 'queued'
        });
    });

    it('leases image bytes and accepts a fully categorized result', async () => {
        const { completed, image, leased } = await completeFirstJob();

        expect(leased).toMatchObject({
            attempt: 1,
            categories: [{
                id: CATEGORY_ID,
                name: 'Продукты'
            }],
            receiptImportId: 'receipt-sequence-1',
            reviewComment: ''
        });
        expect(completed).toMatchObject({
            result: {
                receipt: {
                    totalAmountMinor: 1_200
                }
            },
            status: 'needs_review'
        });
        expect([...image.bytes]).toEqual([...IMAGE_BYTES]);
    });

    it('rejects a category that was not included in the job snapshot', async () => {
        await receiptImportService.createFromImage(USER_ID, {
            bytes: IMAGE_BYTES,
            contentType: 'image/jpeg',
            originalName: 'receipt.jpg'
        });
        const leased = await receiptImportService.leaseNextJob('mac-mini-1');

        if (leased === undefined) {
            throw new Error('Expected a leased job.');
        }

        const result = createWorkerResult();

        result.categorizedItems[0].categoryId = 'unknown-category';

        await expect(receiptImportService.completeJob(
            leased.processingJobId,
            {
                leaseToken: leased.leaseToken,
                result
            }
        )).rejects.toBeInstanceOf(ReceiptWorkerResultError);
    });

    it('creates a new attempt with the review comment and previous result', async () => {
        const { completed } = await completeFirstJob();
        const revision = await receiptImportService.requestRevision(USER_ID, {
            comment: 'Исправить вторую товарную строку.',
            id: completed.id,
            version: completed.version
        });
        const leasedRevision = await receiptImportService.leaseNextJob(
            'mac-mini-1'
        );

        expect(revision.status).toBe('revision_requested');
        expect(leasedRevision).toMatchObject({
            attempt: 1,
            previousResult: {
                rawOcrText: expect.any(String)
            },
            receiptImportId: completed.id,
            reviewComment: 'Исправить вторую товарную строку.'
        });
    });

    it('creates one operation per category group after approval', async () => {
        const { completed } = await completeFirstJob();
        const approved = await receiptImportService.approve(USER_ID, {
            accountId: ACCOUNT_ID,
            id: completed.id,
            version: completed.version
        });
        const ledger = await createOperationService({
            accountRepository: createAccountRepository(database),
            categoryRepository: createCategoryRepository(database),
            contactRepository: createContactRepository(database),
            exchangeRateResolver: createExchangeRateService({
                exchangeRateRepository: createExchangeRateRepository(database)
            }),
            householdResolver: createHouseholdResolver(
                createHouseholdRepository(database)
            ),
            operationRepository: createOperationRepository(database)
        }).getAccountLedger(USER_ID, {
            accountId: ACCOUNT_ID,
            end: '2026-07-29',
            start: '2026-07-29'
        });

        expect(approved.status).toBe('approved');
        expect(approved.operationIds).toHaveLength(2);
        expect(ledger.items).toHaveLength(2);
        expect(ledger.items.map((item) => item.amountMinor).sort())
            .toEqual([500, 700]);
    });
});
