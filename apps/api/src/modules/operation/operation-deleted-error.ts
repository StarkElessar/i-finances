export class OperationDeletedError extends Error {
	public constructor() {
		super('Deleted operation cannot be edited.');
		this.name = 'OperationDeletedError';
	}
}
