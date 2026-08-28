/**
 * Thrown when a transfer cannot be found in the current household.
 */
export class TransferNotFoundError extends Error {
	constructor() {
		super('Transfer was not found.');
		this.name = 'TransferNotFoundError';
	}
}

/**
 * Thrown when the provided transfer version does not match the stored row.
 */
export class TransferVersionConflictError extends Error {
	constructor() {
		super('Transfer version conflict.');
		this.name = 'TransferVersionConflictError';
	}
}

/**
 * Thrown when a transfer cannot be edited because it is soft-deleted.
 */
export class TransferDeletedError extends Error {
	constructor() {
		super('Transfer is deleted.');
		this.name = 'TransferDeletedError';
	}
}

/**
 * Thrown when one of the transfer accounts is unavailable.
 */
export class TransferAccountUnavailableError extends Error {
	constructor() {
		super('Transfer account is unavailable.');
		this.name = 'TransferAccountUnavailableError';
	}
}

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

/**
 * Thrown when the computed credit amount is not a positive minor-unit value.
 */
export class TransferConversionAmountError extends Error {
	constructor() {
		super('Transfer conversion amount is invalid.');
		this.name = 'TransferConversionAmountError';
	}
}
