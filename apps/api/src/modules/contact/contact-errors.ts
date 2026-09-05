export class ContactNotFoundError extends Error {
	public constructor() {
		super('Contact not found.');
		this.name = 'ContactNotFoundError';
	}
}

export class ContactVersionConflictError extends Error {
	public constructor() {
		super('Contact version conflict.');
		this.name = 'ContactVersionConflictError';
	}
}

export class ContactNameConflictError extends Error {
	public constructor() {
		super('Contact name already exists.');
		this.name = 'ContactNameConflictError';
	}
}
