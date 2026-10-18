/**
 * Signals that an authenticated user does not belong to any household yet (onboarding). Every household-scoped
 * route answers it with 403 `household-required` through one shared mapping in `createApiApp`.
 */
export class HouseholdAccessRequiredError extends Error {
	public constructor() {
		super('Household membership required.');
		this.name = 'HouseholdAccessRequiredError';
	}
}
