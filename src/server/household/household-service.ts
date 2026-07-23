import {
    DEFAULT_HOUSEHOLD_BASE_CURRENCY,
    DEFAULT_HOUSEHOLD_ID,
    DEFAULT_HOUSEHOLD_NAME
} from './default-household';
import type {
    HouseholdAccessRecord,
    HouseholdRepository
} from './household-repository';

/**
 * Signals that an authenticated user does not belong to a household.
 */
export class HouseholdAccessRequiredError extends Error {
    constructor() {
        super('Household membership required.');
        this.name = 'HouseholdAccessRequiredError';
    }
}

/**
 * Signals that the first version cannot choose between several households.
 */
export class HouseholdSelectionRequiredError extends Error {
    constructor() {
        super('Household selection required.');
        this.name = 'HouseholdSelectionRequiredError';
    }
}

export type HouseholdResolver = {
    requireForUser: (userId: string) => Promise<HouseholdAccessRecord>;
};

export type HouseholdResolverOptions = {
    now?: () => Date;
};

/**
 * Resolves the single household available in the first product version.
 *
 * Existing development databases may have auth users created before households
 * existed. Until household management UI appears, the resolver attaches such
 * users to the default workspace on first access.
 */
export function createHouseholdResolver(
    repository: HouseholdRepository,
    options: HouseholdResolverOptions = {}
): HouseholdResolver {
    const now = options.now ?? (() => new Date());

    const selectSingleHousehold = (
        households: HouseholdAccessRecord[]
    ): HouseholdAccessRecord | undefined => {
        const household = households[0];

        if (households.length === 1) {
            return household;
        }

        if (households.length > 1) {
            throw new HouseholdSelectionRequiredError();
        }

        return undefined;
    };

    const requireForUser = async (userId: string): Promise<HouseholdAccessRecord> => {
        const availableHouseholds = await repository.findForUser(userId);
        const household = selectSingleHousehold(availableHouseholds);

        if (household) {
            return household;
        }

        const provisionedHouseholds = await repository.ensureMembership({
            baseCurrency: DEFAULT_HOUSEHOLD_BASE_CURRENCY,
            householdId: DEFAULT_HOUSEHOLD_ID,
            householdName: DEFAULT_HOUSEHOLD_NAME,
            joinedAt: now(),
            role: 'owner',
            userId
        });
        const provisionedHousehold = selectSingleHousehold(provisionedHouseholds);

        if (provisionedHousehold) {
            return provisionedHousehold;
        }

        throw new HouseholdAccessRequiredError();
    };

    return { requireForUser };
}
