import { randomUUID } from 'node:crypto';

import { type CurrencyCodeValue, invertExchangeRate } from '~/shared/lib';

import type {
	CurrentExchangeRates,
	ExchangeRateQuote,
	GetCurrentExchangeRatesInput,
	PersistedExchangeRate,
	RefreshDailyExchangeRatesInput,
	ResolveExchangeRateInput,
	UpsertExchangeRateInput
} from '~/entities/exchange-rate';
import {
	getCurrentExchangeRatesInputSchema,
	refreshDailyExchangeRatesInputSchema,
	resolveExchangeRateInputSchema,
	upsertExchangeRateInputSchema
} from '~/entities/exchange-rate';

import { ExchangeRateNotFoundError } from './exchange-rate-errors';
import {
	toExchangeRateQuote,
	toPersistedExchangeRate
} from './exchange-rate-mappers';
import type {
	ExchangeRateService,
	ExchangeRateServiceDependencies
} from './exchange-rate-service.types';

export type {
	DailyExchangeRateProvider,
	ExchangeRateResolver,
	ExchangeRateService,
	ExchangeRateServiceDependencies
} from './exchange-rate-service.types';

/**
 * Creates the application service used to maintain and resolve exchange rates.
 */
export function createExchangeRateService(
	dependencies: ExchangeRateServiceDependencies
): ExchangeRateService {
	const createId = dependencies.createId ?? randomUUID;
	const now = dependencies.now ?? (() => new Date());

	const resolve = async (
		unsafeInput: ResolveExchangeRateInput
	): Promise<ExchangeRateQuote> => {
		const input = resolveExchangeRateInputSchema.parse(unsafeInput);

		if (input.fromCurrency === input.toCurrency) {
			return {
				effectiveOn: input.onDate,
				fromCurrency: input.fromCurrency,
				rate: '1',
				source: 'identity',
				toCurrency: input.toCurrency
			};
		}

		const directRecord = await dependencies.exchangeRateRepository.findLatest({
			fromCurrency: input.fromCurrency,
			onOrBefore: input.onDate,
			toCurrency: input.toCurrency
		});

		if (directRecord !== undefined) {
			return toExchangeRateQuote(directRecord);
		}

		const inverseRecord = await dependencies.exchangeRateRepository.findLatest({
			fromCurrency: input.toCurrency,
			onOrBefore: input.onDate,
			toCurrency: input.fromCurrency
		});

		if (inverseRecord !== undefined) {
			return {
				effectiveOn: inverseRecord.effectiveOn,
				fromCurrency: input.fromCurrency,
				rate: invertExchangeRate(inverseRecord.rate),
				source: inverseRecord.source,
				toCurrency: input.toCurrency
			};
		}

		throw new ExchangeRateNotFoundError(input);
	};

	const upsert = async (
		unsafeInput: UpsertExchangeRateInput
	) => {
		const input = upsertExchangeRateInputSchema.parse(unsafeInput);
		const timestamp = now();
		const record = await dependencies.exchangeRateRepository.upsert({
			...input,
			createdAt: timestamp,
			id: createId(),
			updatedAt: timestamp
		});

		return toPersistedExchangeRate(record);
	};

	const refreshDaily = async (
		unsafeInput: RefreshDailyExchangeRatesInput
	): Promise<PersistedExchangeRate[]> => {
		const input = refreshDailyExchangeRatesInputSchema.parse(unsafeInput);
		const provider = dependencies.dailyRateProvider;

		if (provider === undefined) {
			throw new Error('Daily exchange-rate provider is not configured.');
		}

		const currenciesToRefresh = input.currencies.filter(
			(currency) => currency !== input.baseCurrency
		);

		if (currenciesToRefresh.length === 0) {
			return [];
		}

		const existingRefresh = await dependencies.exchangeRateRepository
			.findRefresh({
				baseCurrency: input.baseCurrency,
				requestedOn: input.requestedOn,
				source: provider.source
			});

		if (existingRefresh !== undefined) {
			return [];
		}

		const providerRates = await provider.getDailyRates({
			...input,
			currencies: currenciesToRefresh
		});

		if (providerRates.length === 0) {
			throw new Error('Daily exchange-rate provider returned no rates.');
		}

		providerRates.forEach((rate) => {
			if (rate.source !== provider.source) {
				throw new Error(
					'Daily exchange-rate provider returned an unexpected source.'
				);
			}
		});

		const records = await Promise.all(providerRates.map(upsert));
		const timestamp = now();

		await dependencies.exchangeRateRepository.recordRefresh({
			baseCurrency: input.baseCurrency,
			createdAt: timestamp,
			id: createId(),
			requestedOn: input.requestedOn,
			source: provider.source,
			updatedAt: timestamp
		});

		return records;
	};

	const getCurrent = async (
		unsafeInput: GetCurrentExchangeRatesInput
	): Promise<CurrentExchangeRates> => {
		const input = getCurrentExchangeRatesInputSchema.parse(unsafeInput);
		const refreshError = await tryRefreshDaily(input);
		const quoteResults = await Promise.all(input.currencies
			.filter((currency) => currency !== input.baseCurrency)
			.map((currency) => resolveCurrentQuote(
				currency,
				input.baseCurrency,
				input.requestedOn
			)));
		const quotes = quoteResults.flatMap((result) => {
			return result.quote ? [result.quote] : [];
		});
		const unavailableCurrencies = quoteResults.flatMap((result) => {
			return result.quote ? [] : [result.currency];
		});

		return {
			baseCurrency: input.baseCurrency,
			quotes,
			refreshError,
			requestedOn: input.requestedOn,
			unavailableCurrencies
		};
	};

	const tryRefreshDaily = async (
		input: RefreshDailyExchangeRatesInput
	): Promise<string | null> => {
		try {
			await refreshDaily(input);
			return null;
		}
		catch (error: unknown) {
			return error instanceof Error
				? error.message
				: 'Failed to refresh exchange rates.';
		}
	};

	const resolveCurrentQuote = async (
		fromCurrency: CurrencyCodeValue,
		toCurrency: CurrencyCodeValue,
		onDate: string
	): Promise<{
		currency: CurrencyCodeValue;
		quote?: ExchangeRateQuote;
	}> => {
		try {
			return {
				currency: fromCurrency,
				quote: await resolve({
					fromCurrency,
					onDate,
					toCurrency
				})
			};
		}
		catch (error: unknown) {
			if (error instanceof ExchangeRateNotFoundError) {
				return { currency: fromCurrency };
			}

			throw error;
		}
	};

	return {
		getCurrent,
		refreshDaily,
		resolve,
		upsert
	};
}
