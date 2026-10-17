export class ReceiptImageValidationError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptImageValidationError';
	}
}
