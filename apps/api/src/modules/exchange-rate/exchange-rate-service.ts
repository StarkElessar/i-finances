import type { CurrencyCode } from '@i-finances/contracts';

import { invertExchangeRate } from './decimal-money';
import { ExchangeRateNotFoundError } from './exchange-rate-errors';
import type { ExchangeRateRepository } from './exchange-rate-repository';

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
	public constructor(private readonly repository: ExchangeRateRepository) {}

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
}
