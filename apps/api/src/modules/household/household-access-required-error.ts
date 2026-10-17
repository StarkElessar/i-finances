/**
 * Signals that an authenticated user does not belong to a household.
 */
export class HouseholdAccessRequiredError extends Error {
	public constructor() {
		super('Household membership required.');
		this.name = 'HouseholdAccessRequiredError';
	}
}
