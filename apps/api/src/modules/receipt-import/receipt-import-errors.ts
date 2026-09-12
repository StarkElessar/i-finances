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
