export class AccountNotFoundError extends Error {
	public constructor() {
		super('Account not found.');
		this.name = 'AccountNotFoundError';
	}
}
