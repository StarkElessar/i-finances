/**
 * Signals that another category in the household owns the normalized name.
 */
export class CategoryNameConflictError extends Error {
	public constructor() {
		super('Category name already exists.');
		this.name = 'CategoryNameConflictError';
	}
}
