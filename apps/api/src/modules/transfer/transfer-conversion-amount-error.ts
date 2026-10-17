/**
 * Thrown when the computed credit amount is not a positive minor-unit value.
 */
export class TransferConversionAmountError extends Error {
	constructor() {
		super('Transfer conversion amount is invalid.');
		this.name = 'TransferConversionAmountError';
	}
}
