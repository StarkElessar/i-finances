/**
 * Signals that the requested category is not part of the active household.
 */
export class CategoryNotFoundError extends Error {
	public constructor() {
		super('Category not found.');
		this.name = 'CategoryNotFoundError';
	}
}

/**
 * Signals that a category changed after the client loaded it.
 */
export class CategoryVersionConflictError extends Error {
	public constructor() {
		super('Category version conflict.');
		this.name = 'CategoryVersionConflictError';
	}
}

/**
 * Signals that another category in the household owns the normalized name.
 */
export class CategoryNameConflictError extends Error {
	public constructor() {
		super('Category name already exists.');
		this.name = 'CategoryNameConflictError';
	}
}
