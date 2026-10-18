import { HouseholdAccessRequiredError } from './household-access-required-error';
import type { HouseholdAccessRecord, HouseholdRepository } from './household-repository';

/**
 * Resolves the household of the current user on every request. Access is decided by membership alone, so removing
 * a member takes effect on their next request.
 *
 * It never creates anything: a user without a membership is in onboarding and must create a household or accept
 * an invitation explicitly (Р4, Р8).
 */
export class HouseholdResolver {
	public constructor(private readonly repository: HouseholdRepository) {}

	public findForUser(userId: string): Promise<HouseholdAccessRecord | undefined> {
		return this.repository.findForUser(userId);
	}

	public async requireForUser(userId: string): Promise<HouseholdAccessRecord> {
		const household = await this.repository.findForUser(userId);

		if (household === undefined) {
			throw new HouseholdAccessRequiredError();
		}

		return household;
	}
}
