export class OperationAccountCurrencyMismatchError extends Error {
	public constructor() {
		super('Operation can only move to an account in the same currency.');
		this.name = 'OperationAccountCurrencyMismatchError';
	}
}
