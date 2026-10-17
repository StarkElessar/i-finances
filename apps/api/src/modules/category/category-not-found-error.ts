/**
 * Signals that the requested category is not part of the active household.
 */
export class CategoryNotFoundError extends Error {
	public constructor() {
		super('Category not found.');
		this.name = 'CategoryNotFoundError';
	}
}
