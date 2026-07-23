/**
 * Signals that the requested account is not part of the active household.
 */
export class AccountNotFoundError extends Error {
    constructor() {
        super('Account not found.');
        this.name = 'AccountNotFoundError';
    }
}

/**
 * Signals that an account changed after the client loaded it.
 */
export class AccountVersionConflictError extends Error {
    constructor() {
        super('Account version conflict.');
        this.name = 'AccountVersionConflictError';
    }
}

/**
 * Signals that changing an account currency would reinterpret ledger history.
 */
export class AccountCurrencyCorrectionRequiredError extends Error {
    constructor() {
        super('Account currency correction requires explicit confirmation.');
        this.name = 'AccountCurrencyCorrectionRequiredError';
    }
}

/**
 * Signals that the account ledger changed while currency correction was prepared.
 */
export class AccountCurrencyCorrectionConflictError extends Error {
    constructor() {
        super('Account currency correction conflict.');
        this.name = 'AccountCurrencyCorrectionConflictError';
    }
}
