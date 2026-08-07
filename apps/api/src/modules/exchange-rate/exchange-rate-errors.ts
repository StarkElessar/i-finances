import type { ResolveExchangeRateInput } from './exchange-rate-service';

/** Signals that no direct or inverse rate exists for the requested date. */
export class ExchangeRateNotFoundError extends Error {
	public constructor(input: ResolveExchangeRateInput) {
		super(
			`Exchange rate ${input.fromCurrency}/${input.toCurrency}`
			+ ` is unavailable on or before ${input.onDate}.`
		);
		this.name = 'ExchangeRateNotFoundError';
	}
}
