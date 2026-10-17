export class OperationReferenceUnavailableError extends Error {
	public constructor(public readonly field: 'categoryId' | 'contactId') {
		super(`Operation reference is unavailable: ${field}.`);
		this.name = 'OperationReferenceUnavailableError';
	}
}
