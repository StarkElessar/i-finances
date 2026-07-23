/**
 * Signals that the requested contact is not part of the active household.
 */
export class ContactNotFoundError extends Error {
    constructor() {
        super('Contact not found.');
        this.name = 'ContactNotFoundError';
    }
}

/**
 * Signals that a contact changed after the client loaded it.
 */
export class ContactVersionConflictError extends Error {
    constructor() {
        super('Contact version conflict.');
        this.name = 'ContactVersionConflictError';
    }
}

/**
 * Signals that another contact in the household owns the normalized name.
 */
export class ContactNameConflictError extends Error {
    constructor() {
        super('Contact name already exists.');
        this.name = 'ContactNameConflictError';
    }
}
