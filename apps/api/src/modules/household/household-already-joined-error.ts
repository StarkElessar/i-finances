/**
 * Signals that the user already belongs to a household and cannot create another one: a user belongs to at most
 * one household (unique `household_members.user_id`, migration 0016).
 */
export class HouseholdAlreadyJoinedError extends Error {
	public constructor() {
		super('The user already belongs to a household.');
		this.name = 'HouseholdAlreadyJoinedError';
	}
}
