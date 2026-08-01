/**
 * Signals that the requested operation does not belong to the active household.
 */
export class OperationNotFoundError extends Error {
	constructor() {
		super('Operation not found.');
		this.name = 'OperationNotFoundError';
	}
}

/**
 * Signals an optimistic-lock conflict.
 */
export class OperationVersionConflictError extends Error {
	constructor() {
		super('Operation version conflict.');
		this.name = 'OperationVersionConflictError';
	}
}

/**
 * Signals that an account cannot accept a new operation.
 */
export class OperationAccountUnavailableError extends Error {
	constructor() {
		super('Operation account is unavailable.');
		this.name = 'OperationAccountUnavailableError';
	}
}

/**
 * Signals that a selected category or contact is unavailable.
 */
export class OperationReferenceUnavailableError extends Error {
	constructor(field: 'categoryId' | 'contactId') {
		super(`Operation reference is unavailable: ${field}.`);
		this.field = field;
		this.name = 'OperationReferenceUnavailableError';
	}

	readonly field: 'categoryId' | 'contactId';
}

/**
 * Signals that a soft-deleted operation must be restored before editing.
 */
export class OperationDeletedError extends Error {
	constructor() {
		super('Deleted operation cannot be edited.');
		this.name = 'OperationDeletedError';
	}
}

/**
 * Signals that conversion rounded a positive amount below one minor unit.
 */
export class OperationConversionAmountError extends Error {
	constructor() {
		super('Converted operation amount is below one minor unit.');
		this.name = 'OperationConversionAmountError';
	}
}
