import type { AppDatabase } from '@/infrastructure/database/client';
import {
	type HouseholdMemberRole,
	householdMembers,
	households
} from '@/infrastructure/database/schema';

import type { CurrencyCode } from '@i-finances/contracts';
import { eq } from 'drizzle-orm';

export type HouseholdAccessRecord = {
	baseCurrency: CurrencyCode;
	id: string;
};

export type EnsureHouseholdMembershipInput = {
	baseCurrency: CurrencyCode;
	householdId: string;
	householdName: string;
	joinedAt: Date;
	role: HouseholdMemberRole;
	userId: string;
};

export class HouseholdRepository {
	public constructor(private readonly database: AppDatabase) {}

	public async findForUser(userId: string): Promise<HouseholdAccessRecord[]> {
		return this.database.select({
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
	}

	public async ensureMembership(
		input: EnsureHouseholdMembershipInput
	): Promise<HouseholdAccessRecord[]> {
		await this.database.insert(households)
			.values({
				baseCurrency: input.baseCurrency,
				createdAt: input.joinedAt,
				id: input.householdId,
				name: input.householdName,
				updatedAt: input.joinedAt
			})
			.onConflictDoNothing();

		await this.database.insert(householdMembers)
			.values({
				householdId: input.householdId,
				joinedAt: input.joinedAt,
				role: input.role,
				userId: input.userId
			})
			.onConflictDoNothing();

		return this.findForUser(input.userId);
	}
}
