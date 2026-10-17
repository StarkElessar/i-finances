/**
 * Thrown when an account that already has operations changes its currency.
 */
export class AccountCurrencyLockedError extends Error {
	public constructor() {
		super('Account currency cannot change while the account has operations.');
		this.name = 'AccountCurrencyLockedError';
	}
}
