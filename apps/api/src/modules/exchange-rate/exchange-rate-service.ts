import { randomUUID } from 'node:crypto';

import type { CurrencyCode, CurrentExchangeRates } from '@i-finances/contracts';

import { invertExchangeRate } from './decimal-money';
import { ExchangeRateNotFoundError } from './exchange-rate-errors';
import type { ExchangeRateRepository } from './exchange-rate-repository';
import type {
	DailyExchangeRateProvider,
	GetCurrentExchangeRatesInput,
	RefreshDailyExchangeRatesInput,
	UpsertExchangeRateInput
} from './exchange-rate-service.types';

export type ExchangeRateServiceOptions = {
	createId?: () => string;
	dailyRateProvider?: DailyExchangeRateProvider;
	now?: () => Date;
};

export type ResolveExchangeRateInput = {
	fromCurrency: CurrencyCode;
	onDate: string;
	toCurrency: CurrencyCode;
};

export type ExchangeRateQuote = {
	effectiveOn: string;
	fromCurrency: CurrencyCode;
	rate: string;
	source: string;
	toCurrency: CurrencyCode;
};

export type ExchangeRateResolver = {
	resolve(input: ResolveExchangeRateInput): Promise<ExchangeRateQuote>;
};

/** Resolves direct, inverse, or identity quotes for historical snapshots. */
export class ExchangeRateService implements ExchangeRateResolver {
	private readonly createId: () => string;
	private readonly now: () => Date;

	public constructor(
		private readonly repository: ExchangeRateRepository,
		private readonly options: ExchangeRateServiceOptions = {}
	) {
		this.createId = options.createId ?? randomUUID;
		this.now = options.now ?? (() => new Date());
	}

	public async resolve(input: ResolveExchangeRateInput): Promise<ExchangeRateQuote> {
		if (input.fromCurrency === input.toCurrency) {
			return {
				effectiveOn: input.onDate,
				fromCurrency: input.fromCurrency,
				rate: '1',
				source: 'identity',
				toCurrency: input.toCurrency
			};
		}

		const directRecord = await this.repository.findLatest({
			fromCurrency: input.fromCurrency,
			onOrBefore: input.onDate,
			toCurrency: input.toCurrency
		});

		if (directRecord !== undefined) {
			return {
				effectiveOn: directRecord.effectiveOn,
				fromCurrency: directRecord.fromCurrency,
				rate: directRecord.rate,
				source: directRecord.source,
				toCurrency: directRecord.toCurrency
			};
		}

		const inverseRecord = await this.repository.findLatest({
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
	}

	public async upsert(input: UpsertExchangeRateInput): Promise<void> {
		const timestamp = this.now();

		await this.repository.upsert({
			...input,
			createdAt: timestamp,
			id: this.createId(),
			updatedAt: timestamp
		});
	}

	/**
	 * Skips work when this source already refreshed for the requested day, which
	 * keeps repeated page loads from hammering the provider.
	 */
	public async refreshDaily(input: RefreshDailyExchangeRatesInput): Promise<void> {
		const provider = this.options.dailyRateProvider;

		if (provider === undefined) {
			throw new Error('Daily exchange-rate provider is not configured.');
		}

		const currenciesToRefresh = input.currencies.filter(
			(currency) => currency !== input.baseCurrency
		);

		if (currenciesToRefresh.length === 0) {
			return;
		}

		const existingRefresh = await this.repository.findRefresh({
			baseCurrency: input.baseCurrency,
			requestedOn: input.requestedOn,
			source: provider.source
		});

		if (existingRefresh !== undefined) {
			return;
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
				throw new Error('Daily exchange-rate provider returned an unexpected source.');
			}
		});

		for (const rate of providerRates) {
			await this.upsert(rate);
		}

		const timestamp = this.now();

		await this.repository.recordRefresh({
			baseCurrency: input.baseCurrency,
			createdAt: timestamp,
			id: this.createId(),
			requestedOn: input.requestedOn,
			source: provider.source,
			updatedAt: timestamp
		});
	}

	/**
	 * A failed refresh is reported alongside the stored rates instead of failing
	 * the request, so the app stays usable when the provider is unreachable.
	 */
	public async getCurrent(
		input: GetCurrentExchangeRatesInput
	): Promise<CurrentExchangeRates> {
		const refreshError = await this.tryRefreshDaily(input);
		const quoteResults = await Promise.all(input.currencies
			.filter((currency) => currency !== input.baseCurrency)
			.map((currency) => this.resolveCurrentQuote(
				currency,
				input.baseCurrency,
				input.requestedOn
			)));

		return {
			baseCurrency: input.baseCurrency,
			quotes: quoteResults.flatMap((result) => result.quote ? [result.quote] : []),
			refreshError,
			requestedOn: input.requestedOn,
			unavailableCurrencies: quoteResults.flatMap(
				(result) => result.quote ? [] : [result.currency]
			)
		};
	}

	private async tryRefreshDaily(
		input: RefreshDailyExchangeRatesInput
	): Promise<string | null> {
		try {
			await this.refreshDaily(input);

			return null;
		}
		catch (error: unknown) {
			return error instanceof Error
				? error.message
				: 'Failed to refresh exchange rates.';
		}
	}

	private async resolveCurrentQuote(
		fromCurrency: CurrencyCode,
		toCurrency: CurrencyCode,
		onDate: string
	): Promise<{ currency: CurrencyCode; quote?: ExchangeRateQuote }> {
		try {
			return {
				currency: fromCurrency,
				quote: await this.resolve({ fromCurrency, onDate, toCurrency })
			};
		}
		catch (error: unknown) {
			if (error instanceof ExchangeRateNotFoundError) {
				return { currency: fromCurrency };
			}

			throw error;
		}
	}
}
