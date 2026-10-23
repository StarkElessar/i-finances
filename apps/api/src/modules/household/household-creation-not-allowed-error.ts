/**
 * Signals that the user has no right to found a household (`HouseholdCreationPolicy`, `app-invitations-v1.md`,
 * section 13): nothing was written.
 */
export class HouseholdCreationNotAllowedError extends Error {
	public constructor() {
		super('The user may not create a household.');
		this.name = 'HouseholdCreationNotAllowedError';
	}
}
