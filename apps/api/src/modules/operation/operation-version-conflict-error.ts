export class OperationVersionConflictError extends Error {
	public constructor() {
		super('Operation version conflict.');
		this.name = 'OperationVersionConflictError';
	}
}
