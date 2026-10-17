export class NationalBankExchangeRateClientError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'NationalBankExchangeRateClientError';
	}
}
