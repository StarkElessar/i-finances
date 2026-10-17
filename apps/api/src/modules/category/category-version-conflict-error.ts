/**
 * Signals that a category changed after the client loaded it.
 */
export class CategoryVersionConflictError extends Error {
	public constructor() {
		super('Category version conflict.');
		this.name = 'CategoryVersionConflictError';
	}
}
