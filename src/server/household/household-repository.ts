import type { CurrencyCodeValue } from '~/shared/lib';

import { type AppDatabase, db } from '~/server/db/client';
import {
	type HouseholdMemberRole,
	householdMembers,
	households
} from '~/server/db/schema';

import { eq } from 'drizzle-orm';

export type HouseholdAccessRecord = {
	baseCurrency: CurrencyCodeValue;
	id: string;
};

export type EnsureHouseholdMembershipInput = {
	baseCurrency: CurrencyCodeValue;
	householdId: string;
	householdName: string;
	joinedAt: Date;
	role: HouseholdMemberRole;
	userId: string;
};

export type HouseholdRepository = {
	ensureMembership: (
		input: EnsureHouseholdMembershipInput
	) => Promise<HouseholdAccessRecord[]>;
	findForUser: (userId: string) => Promise<HouseholdAccessRecord[]>;
};

/**
 * Creates a household repository backed by the supplied Drizzle database.
 */
export function createHouseholdRepository(
	database: AppDatabase = db
): HouseholdRepository {
	const findForUser = async (userId: string): Promise<HouseholdAccessRecord[]> => {
		return database.select({
			baseCurrency: households.baseCurrency,
			id: households.id
		})
			.from(householdMembers)
			.innerJoin(
				households,
				eq(householdMembers.householdId, households.id)
			)
			.where(eq(householdMembers.userId, userId))
			.limit(2);
	};

	const ensureMembership = async (
		input: EnsureHouseholdMembershipInput
	): Promise<HouseholdAccessRecord[]> => {
		await database.insert(households)
			.values({
				baseCurrency: input.baseCurrency,
				createdAt: input.joinedAt,
				id: input.householdId,
				name: input.householdName,
				updatedAt: input.joinedAt
			})
			.onConflictDoNothing();

		await database.insert(householdMembers)
			.values({
				householdId: input.householdId,
				joinedAt: input.joinedAt,
				role: input.role,
				userId: input.userId
			})
			.onConflictDoNothing();

		return findForUser(input.userId);
	};

	return {
		ensureMembership,
		findForUser
	};
}
