/**
 * Thrown when one of the transfer accounts is unavailable.
 */
export class TransferAccountUnavailableError extends Error {
	constructor() {
		super('Transfer account is unavailable.');
		this.name = 'TransferAccountUnavailableError';
	}
}
