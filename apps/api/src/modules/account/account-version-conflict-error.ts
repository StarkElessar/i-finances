export class AccountVersionConflictError extends Error {
	public constructor() {
		super('Account version conflict.');
		this.name = 'AccountVersionConflictError';
	}
}
