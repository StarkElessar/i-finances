/**
 * Thrown when the provided transfer version does not match the stored row.
 */
export class TransferVersionConflictError extends Error {
	constructor() {
		super('Transfer version conflict.');
		this.name = 'TransferVersionConflictError';
	}
}
