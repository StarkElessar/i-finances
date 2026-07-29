/**
 * Signals that the requested receipt import cannot be found in the household.
 */
export class ReceiptImportNotFoundError extends Error {
    constructor() {
        super('Receipt import not found.');
        this.name = 'ReceiptImportNotFoundError';
    }
}

/**
 * Signals that a receipt command used a stale optimistic-lock version.
 */
export class ReceiptImportVersionConflictError extends Error {
    constructor() {
        super('Receipt import version conflict.');
        this.name = 'ReceiptImportVersionConflictError';
    }
}

/**
 * Signals that the current receipt status does not allow the command.
 */
export class ReceiptImportStateError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReceiptImportStateError';
    }
}

/**
 * Signals that the worker lease is missing, expired or belongs to another job.
 */
export class ReceiptJobLeaseError extends Error {
    constructor() {
        super('Receipt processing lease is unavailable.');
        this.name = 'ReceiptJobLeaseError';
    }
}

/**
 * Signals that a worker result violates household or receipt invariants.
 */
export class ReceiptWorkerResultError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReceiptWorkerResultError';
    }
}

/**
 * Signals that an uploaded receipt image is unsupported or too large.
 */
export class ReceiptImageValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReceiptImageValidationError';
    }
}
