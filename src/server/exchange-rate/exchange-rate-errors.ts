import type { ResolveExchangeRateInput } from '~/entities/exchange-rate';

/**
 * Signals that no direct or inverse rate exists on or before the requested date.
 */
export class ExchangeRateNotFoundError extends Error {
	constructor(input: ResolveExchangeRateInput) {
		super(
			`Exchange rate ${input.fromCurrency}/${input.toCurrency}`
			+ ` is unavailable on or before ${input.onDate}.`
		);
		this.name = 'ExchangeRateNotFoundError';
	}
}
