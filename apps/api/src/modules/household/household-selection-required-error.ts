/**
 * Signals that the first version cannot choose between several households.
 */
export class HouseholdSelectionRequiredError extends Error {
	public constructor() {
		super('Household selection required.');
		this.name = 'HouseholdSelectionRequiredError';
	}
}
