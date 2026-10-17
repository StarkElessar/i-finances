export class OperationNotFoundError extends Error {
	public constructor() {
		super('Operation not found.');
		this.name = 'OperationNotFoundError';
	}
}
