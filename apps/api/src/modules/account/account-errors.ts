export class AccountNotFoundError extends Error {
	public constructor() {
		super('Account not found.');
		this.name = 'AccountNotFoundError';
	}
}

export class AccountVersionConflictError extends Error {
	public constructor() {
		super('Account version conflict.');
		this.name = 'AccountVersionConflictError';
	}
}
