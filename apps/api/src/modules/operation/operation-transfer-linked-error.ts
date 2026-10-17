export class OperationTransferLinkedError extends Error {
	public constructor() {
		super('Transfer-linked operation cannot be changed directly.');
		this.name = 'OperationTransferLinkedError';
	}
}
