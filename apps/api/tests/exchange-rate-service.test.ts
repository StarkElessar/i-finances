import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { exchangeRates } from '@/infrastructure/database/schema';
import {
	type DailyExchangeRateProvider,
	ExchangeRateNotFoundError,
	ExchangeRateRepository,
	ExchangeRateService,
	NATIONAL_BANK_EXCHANGE_RATE_SOURCE
} from '@/modules/exchange-rate';

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
	return new ExchangeRateService(new ExchangeRateRepository(database), {
		createId: () => `exchange-rate-${exchangeRateSequence++}`,
		dailyRateProvider,
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
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-24',
			fromCurrency: 'USD',
			rate: '3.25',
			source: 'manual',
			toCurrency: 'BYN'
		});

		currentTimestamp = SECOND_TIMESTAMP;

		await exchangeRateService.upsert({
			effectiveOn: '2026-07-24',
			fromCurrency: 'USD',
			rate: '3.3',
			source: 'corrected-manual',
			toCurrency: 'BYN'
		});
		const records = await database.select().from(exchangeRates);

		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			createdAt: FIRST_TIMESTAMP,
			id: 'exchange-rate-1',
			rate: '3.3',
			source: 'corrected-manual',
			updatedAt: SECOND_TIMESTAMP
		});
	});

	it('resolves the latest direct rate not newer than the requested date', async () => {
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-17',
			fromCurrency: 'USD',
			rate: '3.2',
			source: 'manual',
			toCurrency: 'BYN'
		});
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-20',
			fromCurrency: 'USD',
			rate: '3.25',
			source: 'manual',
			toCurrency: 'BYN'
		});
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-27',
			fromCurrency: 'USD',
			rate: '3.3',
			source: 'manual',
			toCurrency: 'BYN'
		});

		await expect(exchangeRateService.resolve({
			fromCurrency: 'USD',
			onDate: '2026-07-25',
			toCurrency: 'BYN'
		})).resolves.toMatchObject({
			effectiveOn: '2026-07-20',
			rate: '3.25'
		});
	});

	it('resolves an inverse rate while preserving requested direction', async () => {
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-24',
			fromCurrency: 'USD',
			rate: '3.25',
			source: 'manual',
			toCurrency: 'BYN'
		});

		await expect(exchangeRateService.resolve({
			fromCurrency: 'BYN',
			onDate: '2026-07-24',
			toCurrency: 'USD'
		})).resolves.toEqual({
			effectiveOn: '2026-07-24',
			fromCurrency: 'BYN',
			rate: '0.307692307692',
			source: 'manual',
			toCurrency: 'USD'
		});
	});

	it('returns an identity quote without persisting it', async () => {
		await expect(exchangeRateService.resolve({
			fromCurrency: 'EUR',
			onDate: '2026-07-24',
			toCurrency: 'EUR'
		})).resolves.toEqual({
			effectiveOn: '2026-07-24',
			fromCurrency: 'EUR',
			rate: '1',
			source: 'identity',
			toCurrency: 'EUR'
		});

		await expect(database.select().from(exchangeRates)).resolves.toEqual([]);
	});

	it('does not use a future rate when historical data is missing', async () => {
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-25',
			fromCurrency: 'EUR',
			rate: '3.7',
			source: 'manual',
			toCurrency: 'BYN'
		});

		await expect(exchangeRateService.resolve({
			fromCurrency: 'EUR',
			onDate: '2026-07-24',
			toCurrency: 'BYN'
		})).rejects.toBeInstanceOf(ExchangeRateNotFoundError);
	});

	it('refreshes provider rates once for a requested day', async () => {
		let providerCalls = 0;
		const dailyRateProvider: DailyExchangeRateProvider = {
			getDailyRates: async (input) => {
				providerCalls += 1;
				expect(input.currencies).toEqual(['USD', 'EUR']);

				return [
					{
						effectiveOn: '2026-07-24',
						fromCurrency: 'USD',
						rate: '2.8853',
						source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
						toCurrency: 'BYN'
					},
					{
						effectiveOn: '2026-07-24',
						fromCurrency: 'EUR',
						rate: '3.2928',
						source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
						toCurrency: 'BYN'
					}
				];
			},
			source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE
		};

		exchangeRateService = createTestExchangeRateService(dailyRateProvider);

		const first = await exchangeRateService.getCurrent({
			baseCurrency: 'BYN',
			currencies: ['BYN', 'USD', 'USD', 'EUR'],
			requestedOn: '2026-07-24'
		});
		const second = await exchangeRateService.getCurrent({
			baseCurrency: 'BYN',
			currencies: ['USD', 'EUR'],
			requestedOn: '2026-07-24'
		});

		expect(providerCalls).toBe(1);
		expect(first).toMatchObject({
			baseCurrency: 'BYN',
			refreshError: null,
			requestedOn: '2026-07-24',
			unavailableCurrencies: []
		});
		expect(first.quotes).toEqual([
			{
				effectiveOn: '2026-07-24',
				fromCurrency: 'USD',
				rate: '2.8853',
				source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
				toCurrency: 'BYN'
			},
			{
				effectiveOn: '2026-07-24',
				fromCurrency: 'EUR',
				rate: '3.2928',
				source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
				toCurrency: 'BYN'
			}
		]);
		expect(second.quotes).toEqual(first.quotes);
	});

	it('uses stale stored rates when the daily provider is unavailable', async () => {
		await exchangeRateService.upsert({
			effectiveOn: '2026-07-20',
			fromCurrency: 'USD',
			rate: '3.25',
			source: 'manual',
			toCurrency: 'BYN'
		});

		exchangeRateService = createTestExchangeRateService({
			getDailyRates: async () => {
				throw new Error('NBRB unavailable');
			},
			source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE
		});

		const current = await exchangeRateService.getCurrent({
			baseCurrency: 'BYN',
			currencies: ['USD', 'EUR'],
			requestedOn: '2026-07-24'
		});

		expect(current).toEqual({
			baseCurrency: 'BYN',
			quotes: [
				{
					effectiveOn: '2026-07-20',
					fromCurrency: 'USD',
					rate: '3.25',
					source: 'manual',
					toCurrency: 'BYN'
				}
			],
			refreshError: 'NBRB unavailable',
			requestedOn: '2026-07-24',
			unavailableCurrencies: ['EUR']
		});
	});
});
