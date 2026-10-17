/**
 * Thrown when transfer accounts violate currency or identity rules.
 */
export class TransferAccountsInvalidError extends Error {
	readonly field: 'fromAccountId' | 'toAccountId';

	constructor(field: 'fromAccountId' | 'toAccountId', message: string) {
		super(message);
		this.name = 'TransferAccountsInvalidError';
		this.field = field;
	}
}
