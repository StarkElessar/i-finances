import {
	CurrencyCode,
	type CurrencyCodeValue,
	normalizeExchangeRate
} from '~/shared/lib';

import {
	type UpsertExchangeRateInput,
	upsertExchangeRateInputSchema
} from '~/entities/exchange-rate';

import { z } from 'zod';

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
	baseCurrency: CurrencyCodeValue;
	currencies: readonly CurrencyCodeValue[];
	requestedOn: string;
};

export type NationalBankExchangeRateClient = {
	getDailyRates: (
		input: NationalBankDailyRatesInput
	) => Promise<UpsertExchangeRateInput[]>;
	source: typeof NATIONAL_BANK_EXCHANGE_RATE_SOURCE;
};

export type NationalBankExchangeRateClientDependencies = {
	endpoint?: string;
	fetch?: typeof fetch;
};

export class NationalBankExchangeRateClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NationalBankExchangeRateClientError';
	}
}

/**
 * Creates a client for NBRB official daily exchange rates.
 */
export function createNationalBankExchangeRateClient(
	dependencies: NationalBankExchangeRateClientDependencies = {}
): NationalBankExchangeRateClient {
	const endpoint = dependencies.endpoint ?? NATIONAL_BANK_DAILY_RATES_URL;
	const fetchRates = dependencies.fetch ?? fetch;

	const getDailyRates = async (
		input: NationalBankDailyRatesInput
	): Promise<UpsertExchangeRateInput[]> => {
		if (input.baseCurrency !== CurrencyCode.BYN) {
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

		const response = await fetchRates(createDailyRatesUrl(
			endpoint,
			input.requestedOn
		), {
			headers: {
				accept: 'application/json'
			}
		});

		if (!response.ok) {
			throw new NationalBankExchangeRateClientError(
				`NBRB rates request failed with status ${response.status}.`
			);
		}

		const payload = nationalBankDailyRatesSchema.parse(
			await response.json()
		);
		const ratesByCurrency = createRatesByCurrency(
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
	};

	return {
		getDailyRates,
		source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE
	};
}

function createDailyRatesUrl(
	endpoint: string,
	requestedOn: string
): string {
	const url = new URL(endpoint);

	url.searchParams.set('ondate', requestedOn);
	url.searchParams.set('periodicity', '0');

	return url.toString();
}

function createRatesByCurrency(
	rows: readonly NationalBankDailyRate[],
	currencies: readonly CurrencyCodeValue[],
	baseCurrency: CurrencyCodeValue
): Map<CurrencyCodeValue, UpsertExchangeRateInput> {
	const requestedCurrencies = new Set(currencies);
	const ratesByCurrency = new Map<CurrencyCodeValue, UpsertExchangeRateInput>();

	rows.forEach((row) => {
		if (!CurrencyCode.isCurrencyCode(row.Cur_Abbreviation)) {
			return;
		}

		const currency = row.Cur_Abbreviation;

		if (!requestedCurrencies.has(currency)) {
			return;
		}

		ratesByCurrency.set(currency, createUpsertInput(row, baseCurrency));
	});

	return ratesByCurrency;
}

function createUpsertInput(
	row: NationalBankDailyRate,
	baseCurrency: CurrencyCodeValue
): UpsertExchangeRateInput {
	const rate = normalizeExchangeRate(
		(row.Cur_OfficialRate / row.Cur_Scale).toFixed(12)
	);

	if (rate === undefined) {
		throw new NationalBankExchangeRateClientError(
			`NBRB response contains an invalid rate for ${row.Cur_Abbreviation}.`
		);
	}

	return upsertExchangeRateInputSchema.parse({
		effectiveOn: row.Date.slice(0, 10),
		fromCurrency: row.Cur_Abbreviation,
		rate,
		source: NATIONAL_BANK_EXCHANGE_RATE_SOURCE,
		toCurrency: baseCurrency
	});
}
