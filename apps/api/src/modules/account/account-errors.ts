export class AccountNotFoundError extends Error {
	public constructor() {
		super('Account not found.');
		this.name = 'AccountNotFoundError';
	}
}

export class AccountVersionConflictError extends Error {
	public constructor() {
		super('Account version conflict.');
		this.name = 'AccountVersionConflictError';
	}
}

export class AccountCurrencyCorrectionRequiredError extends Error {
	public constructor() {
		super('Account currency correction requires explicit confirmation.');
		this.name = 'AccountCurrencyCorrectionRequiredError';
	}
}

export class AccountCurrencyCorrectionConflictError extends Error {
	public constructor() {
		super('Account currency correction conflict.');
		this.name = 'AccountCurrencyCorrectionConflictError';
	}
}

export class AccountConversionAmountError extends Error {
	public constructor() {
		super('Converted account operation amount is below one minor unit.');
		this.name = 'AccountConversionAmountError';
	}
}
