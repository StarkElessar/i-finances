export class ReceiptImportNotFoundError extends Error {
	public constructor() {
		super('Receipt import not found.');
		this.name = 'ReceiptImportNotFoundError';
	}
}

export class ReceiptImportVersionConflictError extends Error {
	public constructor() {
		super('Receipt import version conflict.');
		this.name = 'ReceiptImportVersionConflictError';
	}
}

export class ReceiptImportStateError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptImportStateError';
	}
}

export class ReceiptJobLeaseError extends Error {
	public constructor() {
		super('Receipt processing lease is unavailable.');
		this.name = 'ReceiptJobLeaseError';
	}
}

export class ReceiptWorkerResultError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptWorkerResultError';
	}
}

export class ReceiptImageValidationError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptImageValidationError';
	}
}

export class ReceiptWorkerAuthenticationError extends Error {
	public readonly statusCode = 401;

	public constructor() {
		super('Receipt worker authentication failed.');
		this.name = 'ReceiptWorkerAuthenticationError';
	}
}

export class ReceiptWorkerConfigurationError extends Error {
	public readonly statusCode = 503;

	public constructor() {
		super('Receipt worker API key is not configured.');
		this.name = 'ReceiptWorkerConfigurationError';
	}
}
