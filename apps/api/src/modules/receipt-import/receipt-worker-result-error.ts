export class ReceiptWorkerResultError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'ReceiptWorkerResultError';
	}
}
