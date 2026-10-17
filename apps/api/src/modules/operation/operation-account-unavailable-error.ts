export class OperationAccountUnavailableError extends Error {
	public constructor() {
		super('Operation account is unavailable.');
		this.name = 'OperationAccountUnavailableError';
	}
}
