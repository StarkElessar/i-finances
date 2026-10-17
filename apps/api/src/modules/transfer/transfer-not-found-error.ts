/**
 * Thrown when a transfer cannot be found in the current household.
 */
export class TransferNotFoundError extends Error {
	constructor() {
		super('Transfer was not found.');
		this.name = 'TransferNotFoundError';
	}
}
