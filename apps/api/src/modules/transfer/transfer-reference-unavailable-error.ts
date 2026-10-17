/**
 * Thrown when the selected contact cannot be used for a transfer.
 */
export class TransferReferenceUnavailableError extends Error {
	readonly field = 'contactId' as const;

	constructor() {
		super('Transfer contact is unavailable.');
		this.name = 'TransferReferenceUnavailableError';
	}
}
