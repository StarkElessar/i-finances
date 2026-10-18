import type { AppDatabase } from '@/infrastructure/database/client';
import {
	type HouseholdMemberRole,
	householdMembers,
	households,
	telegramAccounts,
	users
} from '@/infrastructure/database/schema';

import type { CurrencyCode } from '@i-finances/contracts';
import { asc, eq } from 'drizzle-orm';

import { isUniqueConstraintError } from './is-unique-constraint-error';

/**
 * The caller's household together with the caller's role in it.
 */
export type HouseholdAccessRecord = {
	baseCurrency: CurrencyCode;
	id: string;
	name: string;
	role: HouseholdMemberRole;
};

export type HouseholdMemberView = {
	displayName: string;
	joinedAt: Date;
	role: HouseholdMemberRole;
	telegramUsername: string | null;
	userId: string;
};

export type CreateHouseholdWithOwnerInput = {
	baseCurrency: CurrencyCode;
	createdAt: Date;
	householdId: string;
	name: string;
	ownerUserId: string;
};

export class HouseholdRepository {
	public constructor(private readonly database: AppDatabase) {}

	/**
	 * The household of the user, if any. A user has at most one membership (unique `household_members.user_id`).
	 */
	public async findForUser(userId: string): Promise<HouseholdAccessRecord | undefined> {
		const [record] = await this.database.select({
			baseCurrency: households.baseCurrency,
			id: households.id,
			name: households.name,
			role: householdMembers.role
		})
			.from(householdMembers)
			.innerJoin(households, eq(householdMembers.householdId, households.id))
			.where(eq(householdMembers.userId, userId))
			.limit(1);

		return record;
	}

	public async listMembers(householdId: string): Promise<HouseholdMemberView[]> {
		return this.database.select({
			displayName: users.displayName,
			joinedAt: householdMembers.joinedAt,
			role: householdMembers.role,
			telegramUsername: telegramAccounts.username,
			userId: householdMembers.userId
		})
			.from(householdMembers)
			.innerJoin(users, eq(householdMembers.userId, users.id))
			.leftJoin(telegramAccounts, eq(telegramAccounts.userId, householdMembers.userId))
			.where(eq(householdMembers.householdId, householdId))
			.orderBy(asc(householdMembers.joinedAt), asc(householdMembers.userId));
	}

	/**
	 * Creates the household and the owner membership in one transaction. Returns `undefined`, writing nothing, when
	 * the user already belongs to a household: either seen inside the transaction or reported by the unique index on
	 * `household_members.user_id` when another connection won the race.
	 */
	public createWithOwner(input: CreateHouseholdWithOwnerInput): HouseholdAccessRecord | undefined {
		try {
			return this.database.transaction((transaction) => {
				const existing = transaction.select({ householdId: householdMembers.householdId })
					.from(householdMembers)
					.where(eq(householdMembers.userId, input.ownerUserId))
					.limit(1)
					.get();

				if (existing !== undefined) {
					return undefined;
				}

				transaction.insert(households)
					.values({
						baseCurrency: input.baseCurrency,
						createdAt: input.createdAt,
						id: input.householdId,
						name: input.name,
						updatedAt: input.createdAt
					})
					.run();
				transaction.insert(householdMembers)
					.values({
						householdId: input.householdId,
						joinedAt: input.createdAt,
						role: 'owner',
						userId: input.ownerUserId
					})
					.run();

				return {
					baseCurrency: input.baseCurrency,
					id: input.householdId,
					name: input.name,
					role: 'owner' as const
				};
			});
		}
		catch (error: unknown) {
			if (isUniqueConstraintError(error)) {
				return undefined;
			}

			throw error;
		}
	}

	public async rename(householdId: string, name: string, updatedAt: Date): Promise<void> {
		await this.database.update(households)
			.set({ name, updatedAt })
			.where(eq(households.id, householdId));
	}
}
