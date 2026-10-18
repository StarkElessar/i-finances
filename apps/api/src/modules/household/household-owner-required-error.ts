/**
 * Signals that the action is reserved for the household owner (Р6).
 */
export class HouseholdOwnerRequiredError extends Error {
	public constructor() {
		super('Household owner role required.');
		this.name = 'HouseholdOwnerRequiredError';
	}
}
