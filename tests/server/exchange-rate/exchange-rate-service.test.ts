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

import type { AppDatabase } from '~/server/db/client';
import * as schema from '~/server/db/schema';
import { exchangeRates } from '~/server/db/schema';
import { ExchangeRateNotFoundError } from '~/server/exchange-rate/exchange-rate-errors';
import { createExchangeRateRepository } from '~/server/exchange-rate/exchange-rate-repository';
import {
    createExchangeRateService,
    type DailyExchangeRateProvider,
    type ExchangeRateService
} from '~/server/exchange-rate/exchange-rate-service';
import { NATIONAL_BANK_EXCHANGE_RATE_SOURCE } from '~/server/exchange-rate/national-bank-client';
import { CurrencyCode } from '~/shared/lib';

const FIRST_TIMESTAMP = new Date('2026-07-24T10:00:00.000Z');
const SECOND_TIMESTAMP = new Date('2026-07-24T11:00:00.000Z');

let connection: Database.Database;
let currentTimestamp: Date;
let database: AppDatabase;
let exchangeRateSequence: number;
let exchangeRateService: ExchangeRateService;

function createTestExchangeRateService(
    dailyRateProvider?: DailyExchangeRateProvider
): ExchangeRateService {
    return createExchangeRateService({
        createId: () => `exchange-rate-${exchangeRateSequence++}`,
        dailyRateProvider,
        exchangeRateRepository: createExchangeRateRepository(database),
        now: () => new Date(currentTimestamp)
    });
}

beforeEach(() => {
    connection = new Database(':memory:');
    connection.pragma('foreign_keys = ON');
    database = drizzle(connection, { schema });
    migrate(database, { migrationsFolder: './drizzle' });
    currentTimestamp = FIRST_TIMESTAMP;
    exchangeRateSequence = 1;
    exchangeRateService = createTestExchangeRateService();
});

afterEach(() => {
    connection.close();
});

describe('exchange-rate service persistence', () => {
    it('upserts one canonical rate without replacing its identity', async () => {
        const created = await exchangeRateService.upsert({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        currentTimestamp = SECOND_TIMESTAMP;

        const updated = await exchangeRateService.upsert({
            effectiveOn: created.effectiveOn,
            fromCurrency: created.fromCurrency,
            rate: '3.3',
            source: 'corrected-manual',
            toCurrency: created.toCurrency
        });
        const records = await database.select().from(exchangeRates);

        expect(updated).toMatchObject({
            createdAt: FIRST_TIMESTAMP.toISOString(),
            id: created.id,
            rate: '3.3',
            source: 'corrected-manual',
            updatedAt: SECOND_TIMESTAMP.toISOString()
        });
        expect(records).toHaveLength(1);
    });

    it('resolves the latest direct rate not newer than the requested date', async () => {
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-17',
            fromCurrency: CurrencyCode.USD,
            rate: '3.2',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-20',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-27',
            fromCurrency: CurrencyCode.USD,
            rate: '3.3',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        await expect(exchangeRateService.resolve({
            fromCurrency: CurrencyCode.USD,
            onDate: '2026-07-25',
            toCurrency: CurrencyCode.BYN
        })).resolves.toMatchObject({
            effectiveOn: '2026-07-20',
            rate: '3.25'
        });
    });

    it('resolves an inverse rate while preserving requested direction', async () => {
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        await expect(exchangeRateService.resolve({
            fromCurrency: CurrencyCode.BYN,
            onDate: '2026-07-24',
            toCurrency: CurrencyCode.USD
        })).resolves.toEqual({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.BYN,
            rate: '0.307692307692',
            source: 'manual',
            toCurrency: CurrencyCode.USD
        });
    });

    it('returns an identity quote without persisting it', async () => {
        await expect(exchangeRateService.resolve({
            fromCurrency: CurrencyCode.EUR,
            onDate: '2026-07-24',
            toCurrency: CurrencyCode.EUR
        })).resolves.toEqual({
            effectiveOn: '2026-07-24',
            fromCurrency: CurrencyCode.EUR,
            rate: '1',
            source: 'identity',
            toCurrency: CurrencyCode.EUR
        });

        await expect(database.select().from(exchangeRates)).resolves.toEqual([]);
    });

    it('does not use a future rate when historical data is missing', async () => {
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-25',
            fromCurrency: CurrencyCode.EUR,
            rate: '3.7',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        await expect(exchangeRateService.resolve({
            fromCurrency: CurrencyCode.EUR,
            onDate: '2026-07-24',
            toCurrency: CurrencyCode.BYN
        })).rejects.toBeInstanceOf(ExchangeRateNotFoundError);
    });

    it('refreshes provider rates once for a requested day', async () => {
        let providerCalls = 0;
        const dailyRateProvider: DailyExchangeRateProvider = {
            getDailyRates: async (input) => {
                providerCalls += 1;
                expect(input.currencies).toEqual([
                    CurrencyCode.USD,
                    CurrencyCode.EUR
                ]);

                return [
                    {
                        effectiveOn: '2026-07-24',
                        fromCurrency: CurrencyCode.USD,
                        rate: '2.8853',
                        source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                        toCurrency: CurrencyCode.BYN
                    },
                    {
                        effectiveOn: '2026-07-24',
                        fromCurrency: CurrencyCode.EUR,
                        rate: '3.2928',
                        source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                        toCurrency: CurrencyCode.BYN
                    }
                ];
            },
            source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE
        };

        exchangeRateService = createTestExchangeRateService(dailyRateProvider);

        const first = await exchangeRateService.getCurrent({
            baseCurrency: CurrencyCode.BYN,
            currencies: [
                CurrencyCode.BYN,
                CurrencyCode.USD,
                CurrencyCode.USD,
                CurrencyCode.EUR
            ],
            requestedOn: '2026-07-24'
        });
        const second = await exchangeRateService.getCurrent({
            baseCurrency: CurrencyCode.BYN,
            currencies: [CurrencyCode.USD, CurrencyCode.EUR],
            requestedOn: '2026-07-24'
        });

        expect(providerCalls).toBe(1);
        expect(first).toMatchObject({
            baseCurrency: CurrencyCode.BYN,
            refreshError: null,
            requestedOn: '2026-07-24',
            unavailableCurrencies: []
        });
        expect(first.quotes).toEqual([
            {
                effectiveOn: '2026-07-24',
                fromCurrency: CurrencyCode.USD,
                rate: '2.8853',
                source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                toCurrency: CurrencyCode.BYN
            },
            {
                effectiveOn: '2026-07-24',
                fromCurrency: CurrencyCode.EUR,
                rate: '3.2928',
                source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
                toCurrency: CurrencyCode.BYN
            }
        ]);
        expect(second.quotes).toEqual(first.quotes);
    });

    it('uses stale stored rates when the daily provider is unavailable', async () => {
        await exchangeRateService.upsert({
            effectiveOn: '2026-07-20',
            fromCurrency: CurrencyCode.USD,
            rate: '3.25',
            source: 'manual',
            toCurrency: CurrencyCode.BYN
        });

        exchangeRateService = createTestExchangeRateService({
            getDailyRates: async () => {
                throw new Error('NBRB unavailable');
            },
            source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE
        });

        const current = await exchangeRateService.getCurrent({
            baseCurrency: CurrencyCode.BYN,
            currencies: [CurrencyCode.USD, CurrencyCode.EUR],
            requestedOn: '2026-07-24'
        });

        expect(current).toEqual({
            baseCurrency: CurrencyCode.BYN,
            quotes: [
                {
                    effectiveOn: '2026-07-20',
                    fromCurrency: CurrencyCode.USD,
                    rate: '3.25',
                    source: 'manual',
                    toCurrency: CurrencyCode.BYN
                }
            ],
            refreshError: 'NBRB unavailable',
            requestedOn: '2026-07-24',
            unavailableCurrencies: [CurrencyCode.EUR]
        });
    });
});
