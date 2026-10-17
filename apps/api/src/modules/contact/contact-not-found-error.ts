export class ContactNotFoundError extends Error {
	public constructor() {
		super('Contact not found.');
		this.name = 'ContactNotFoundError';
	}
}
