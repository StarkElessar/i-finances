/**
 * Signals that the user to remove is not a member of the caller's household. The same for an unknown user id and for
 * a member of another household, so the answer does not tell them apart (no existence oracle).
 */
export class HouseholdMemberNotFoundError extends Error {
	public constructor() {
		super('Household member not found.');
		this.name = 'HouseholdMemberNotFoundError';
	}
}
