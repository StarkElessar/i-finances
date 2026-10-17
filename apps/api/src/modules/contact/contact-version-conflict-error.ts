export class ContactVersionConflictError extends Error {
	public constructor() {
		super('Contact version conflict.');
		this.name = 'ContactVersionConflictError';
	}
}
