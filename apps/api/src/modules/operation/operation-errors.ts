export class OperationNotFoundError extends Error {
	public constructor() {
		super('Operation not found.');
		this.name = 'OperationNotFoundError';
	}
}

export class OperationVersionConflictError extends Error {
	public constructor() {
		super('Operation version conflict.');
		this.name = 'OperationVersionConflictError';
	}
}

export class OperationAccountUnavailableError extends Error {
	public constructor() {
		super('Operation account is unavailable.');
		this.name = 'OperationAccountUnavailableError';
	}
}

export class OperationReferenceUnavailableError extends Error {
	public constructor(public readonly field: 'categoryId' | 'contactId') {
		super(`Operation reference is unavailable: ${field}.`);
		this.name = 'OperationReferenceUnavailableError';
	}
}

export class OperationDeletedError extends Error {
	public constructor() {
		super('Deleted operation cannot be edited.');
		this.name = 'OperationDeletedError';
	}
}

export class OperationConversionAmountError extends Error {
	public constructor() {
		super('Converted operation amount is below one minor unit.');
		this.name = 'OperationConversionAmountError';
	}
}

export class OperationTransferLinkedError extends Error {
	public constructor() {
		super('Transfer-linked operation cannot be changed directly.');
		this.name = 'OperationTransferLinkedError';
	}
}
