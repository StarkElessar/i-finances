export class ReceiptImportVersionConflictError extends Error {
	public constructor() {
		super('Receipt import version conflict.');
		this.name = 'ReceiptImportVersionConflictError';
	}
}
