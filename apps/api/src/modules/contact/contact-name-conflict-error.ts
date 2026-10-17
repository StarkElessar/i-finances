export class ContactNameConflictError extends Error {
	public constructor() {
		super('Contact name already exists.');
		this.name = 'ContactNameConflictError';
	}
}
