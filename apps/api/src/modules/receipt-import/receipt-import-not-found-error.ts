export class ReceiptImportNotFoundError extends Error {
	public constructor() {
		super('Receipt import not found.');
		this.name = 'ReceiptImportNotFoundError';
	}
}
