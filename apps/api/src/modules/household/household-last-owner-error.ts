/**
 * Signals that the last owner tried to leave: a household always has an owner (Р6). Handing over ownership and
 * deleting a household are v2.
 */
export class HouseholdLastOwnerError extends Error {
	public constructor() {
		super('The last owner cannot leave the household.');
		this.name = 'HouseholdLastOwnerError';
	}
}
