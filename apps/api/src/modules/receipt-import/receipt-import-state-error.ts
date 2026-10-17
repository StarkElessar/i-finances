export class ReceiptImportStateError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptImportStateError';
	}
}
