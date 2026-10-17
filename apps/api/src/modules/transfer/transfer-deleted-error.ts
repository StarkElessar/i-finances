/**
 * Thrown when a transfer cannot be edited because it is soft-deleted.
 */
export class TransferDeletedError extends Error {
	constructor() {
		super('Transfer is deleted.');
		this.name = 'TransferDeletedError';
	}
}
