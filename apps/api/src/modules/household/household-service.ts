import { randomUUID } from 'node:crypto';

import type {
	CreateHouseholdInput,
	CurrencyCode,
	HouseholdDetails,
	UpdateHouseholdInput
} from '@i-finances/contracts';

import { HouseholdAlreadyJoinedError } from './household-already-joined-error';
import { HouseholdOwnerRequiredError } from './household-owner-required-error';
import type { HouseholdAccessRecord, HouseholdRepository } from './household-repository';
import type { HouseholdResolver } from './household-resolver';

/**
 * Exchange rates come only from the National Bank of Belarus, whose client supports BYN as the base currency only,
 * so every new household is a BYN household in v1 (Р4).
 */
export const NEW_HOUSEHOLD_BASE_CURRENCY: CurrencyCode = 'BYN';

export type HouseholdServiceDependencies = {
	createId?: () => string;
	householdRepository: HouseholdRepository;
	householdResolver: HouseholdResolver;
	now?: () => Date;
};

/**
 * The caller's own household: read it, create one in onboarding, rename it as the owner. The household always
 * comes from the caller's membership, never from the request.
 */
export class HouseholdService {
	private readonly createId: () => string;
	private readonly now: () => Date;

	public constructor(private readonly dependencies: HouseholdServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
	}

	public async get(userId: string): Promise<HouseholdDetails> {
		return this.toDetails(await this.dependencies.householdResolver.requireForUser(userId));
	}

	/**
	 * Creates a household with the caller as its owner. Throws `HouseholdAlreadyJoinedError`, writing nothing, when
	 * the caller already belongs to a household.
	 */
	public async create(userId: string, input: CreateHouseholdInput): Promise<HouseholdDetails> {
		const household = this.dependencies.householdRepository.createWithOwner({
			baseCurrency: NEW_HOUSEHOLD_BASE_CURRENCY,
			createdAt: this.now(),
			householdId: this.createId(),
			name: input.name,
			ownerUserId: userId
		});

		if (household === undefined) {
			throw new HouseholdAlreadyJoinedError();
		}

		return this.toDetails(household);
	}

	public async rename(userId: string, input: UpdateHouseholdInput): Promise<HouseholdDetails> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);

		if (household.role !== 'owner') {
			throw new HouseholdOwnerRequiredError();
		}

		await this.dependencies.householdRepository.rename(household.id, input.name, this.now());

		return this.toDetails({ ...household, name: input.name });
	}

	private async toDetails(household: HouseholdAccessRecord): Promise<HouseholdDetails> {
		const members = await this.dependencies.householdRepository.listMembers(household.id);

		return {
			baseCurrency: household.baseCurrency,
			id: household.id,
			members: members.map((member) => ({
				displayName: member.displayName,
				joinedAt: member.joinedAt.toISOString(),
				role: member.role,
				telegramUsername: member.telegramUsername,
				userId: member.userId
			})),
			name: household.name,
			role: household.role
		};
	}
}
