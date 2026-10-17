export class OperationConversionAmountError extends Error {
	public constructor() {
		super('Converted operation amount is below one minor unit.');
		this.name = 'OperationConversionAmountError';
	}
}
