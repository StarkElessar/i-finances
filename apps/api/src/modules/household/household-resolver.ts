import type { CurrencyCode } from '@i-finances/contracts';

import type { HouseholdRepository } from './household-repository';
import { type HouseholdAccessRecord } from './household-repository';

export const DEFAULT_HOUSEHOLD_ID = 'default-household';
export const DEFAULT_HOUSEHOLD_NAME = 'Семья';
export const DEFAULT_HOUSEHOLD_BASE_CURRENCY: CurrencyCode = 'BYN';

/**
 * Signals that an authenticated user does not belong to a household.
 */
export class HouseholdAccessRequiredError extends Error {
	public constructor() {
		super('Household membership required.');
		this.name = 'HouseholdAccessRequiredError';
	}
}

/**
 * Signals that the first version cannot choose between several households.
 */
export class HouseholdSelectionRequiredError extends Error {
	public constructor() {
		super('Household selection required.');
		this.name = 'HouseholdSelectionRequiredError';
	}
}

export class HouseholdResolver {
	public constructor(
		private readonly repository: HouseholdRepository,
		private readonly now: () => Date = () => new Date()
	) {}

	/**
	 * Resolves the one household available in the first product version.
	 *
	 * Existing development databases may contain users created before
	 * households existed, so first access provisions the default workspace.
	 */
	public async requireForUser(userId: string): Promise<HouseholdAccessRecord> {
		const availableHouseholds = await this.repository.findForUser(userId);
		const household = this.selectSingleHousehold(availableHouseholds);

		if (household !== undefined) {
			return household;
		}

		const provisionedHouseholds = await this.repository.ensureMembership({
			baseCurrency: DEFAULT_HOUSEHOLD_BASE_CURRENCY,
			householdId: DEFAULT_HOUSEHOLD_ID,
			householdName: DEFAULT_HOUSEHOLD_NAME,
			joinedAt: this.now(),
			role: 'owner',
			userId
		});
		const provisionedHousehold = this.selectSingleHousehold(provisionedHouseholds);

		if (provisionedHousehold !== undefined) {
			return provisionedHousehold;
		}

		throw new HouseholdAccessRequiredError();
	}

	private selectSingleHousehold(
		households: HouseholdAccessRecord[]
	): HouseholdAccessRecord | undefined {
		const household = households[0];

		if (households.length === 1) {
			return household;
		}

		if (households.length > 1) {
			throw new HouseholdSelectionRequiredError();
		}

		return undefined;
	}
}
