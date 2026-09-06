import type { CurrencyCode } from '@i-finances/contracts';
import { currencyCodeSchema } from '@i-finances/contracts';
import { z } from 'zod';

import { normalizeExchangeRate } from './decimal-money';
import type { UpsertExchangeRateInput } from './exchange-rate-service.types';

export const NATIONAL_BANK_EXCHANGE_RATE_SOURCE = 'nbrb';

const NATIONAL_BANK_DAILY_RATES_URL = 'https://api.nbrb.by/exrates/rates';

const nationalBankDailyRateSchema = z.object({
	Cur_Abbreviation: z.string(),
	Cur_OfficialRate: z.number().positive(),
	Cur_Scale: z.number().int().positive(),
	Date: z.string()
});

const nationalBankDailyRatesSchema = z.array(nationalBankDailyRateSchema);

type NationalBankDailyRate = z.infer<typeof nationalBankDailyRateSchema>;

export type NationalBankDailyRatesInput = {
	baseCurrency: CurrencyCode;
	currencies: readonly CurrencyCode[];
	requestedOn: string;
};

export type NationalBankExchangeRateClientDependencies = {
	endpoint?: string;
	fetch?: typeof globalThis.fetch;
};

export class NationalBankExchangeRateClientError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'NationalBankExchangeRateClientError';
	}
}

function isCurrencyCode(value: string): value is CurrencyCode {
	return currencyCodeSchema.safeParse(value).success;
}

/** Reads official daily rates from the National Bank of Belarus. */
export class NationalBankExchangeRateClient {
	public readonly source = NATIONAL_BANK_EXCHANGE_RATE_SOURCE;

	private readonly endpoint: string;
	private readonly fetcher: typeof globalThis.fetch;

	public constructor(dependencies: NationalBankExchangeRateClientDependencies = {}) {
		this.endpoint = dependencies.endpoint ?? NATIONAL_BANK_DAILY_RATES_URL;
		this.fetcher = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
	}

	public async getDailyRates(
		input: NationalBankDailyRatesInput
	): Promise<UpsertExchangeRateInput[]> {
		if (input.baseCurrency !== 'BYN') {
			throw new NationalBankExchangeRateClientError(
				'NBRB rates can only be fetched against BYN.'
			);
		}

		const targetCurrencies = input.currencies.filter(
			(currency) => currency !== input.baseCurrency
		);

		if (targetCurrencies.length === 0) {
			return [];
		}

		const response = await this.fetcher(
			this.createDailyRatesUrl(input.requestedOn),
			{ headers: { accept: 'application/json' } }
		);

		if (!response.ok) {
			throw new NationalBankExchangeRateClientError(
				`NBRB rates request failed with status ${response.status}.`
			);
		}

		const payload = nationalBankDailyRatesSchema.parse(await response.json());
		const ratesByCurrency = this.createRatesByCurrency(
			payload,
			targetCurrencies,
			input.baseCurrency
		);
		const missingCurrencies = targetCurrencies.filter(
			(currency) => ratesByCurrency.get(currency) === undefined
		);

		if (missingCurrencies.length > 0) {
			throw new NationalBankExchangeRateClientError(
				`NBRB response is missing rates for ${missingCurrencies.join(', ')}.`
			);
		}

		return targetCurrencies.map((currency) => {
			const rate = ratesByCurrency.get(currency);

			if (rate === undefined) {
				throw new NationalBankExchangeRateClientError(
					`NBRB response is missing rate for ${currency}.`
				);
			}

			return rate;
		});
	}

	private createDailyRatesUrl(requestedOn: string): string {
		const url = new URL(this.endpoint);

		url.searchParams.set('ondate', requestedOn);
		url.searchParams.set('periodicity', '0');

		return url.toString();
	}

	private createRatesByCurrency(
		rows: readonly NationalBankDailyRate[],
		currencies: readonly CurrencyCode[],
		baseCurrency: CurrencyCode
	): Map<CurrencyCode, UpsertExchangeRateInput> {
		const requestedCurrencies = new Set(currencies);
		const ratesByCurrency = new Map<CurrencyCode, UpsertExchangeRateInput>();

		rows.forEach((row) => {
			if (!isCurrencyCode(row.Cur_Abbreviation)) {
				return;
			}

			if (!requestedCurrencies.has(row.Cur_Abbreviation)) {
				return;
			}

			ratesByCurrency.set(
				row.Cur_Abbreviation,
				this.createUpsertInput(row, row.Cur_Abbreviation, baseCurrency)
			);
		});

		return ratesByCurrency;
	}

	private createUpsertInput(
		row: NationalBankDailyRate,
		fromCurrency: CurrencyCode,
		baseCurrency: CurrencyCode
	): UpsertExchangeRateInput {
		const rate = normalizeExchangeRate(
			(row.Cur_OfficialRate / row.Cur_Scale).toFixed(12)
		);

		if (rate === undefined) {
			throw new NationalBankExchangeRateClientError(
				`NBRB response contains an invalid rate for ${row.Cur_Abbreviation}.`
			);
		}

		return {
			effectiveOn: row.Date.slice(0, 10),
			fromCurrency,
			rate,
			source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
			toCurrency: baseCurrency
		};
	}
}
