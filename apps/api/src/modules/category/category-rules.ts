import type { HouseholdResolver } from '@/modules/household';

import { normalizeCategoryIdentity } from '@i-finances/contracts';

import {
	CategoryNameConflictError,
	CategoryNotFoundError,
	CategoryVersionConflictError
} from './category-errors';
import type { CategoryRepository } from './category-repository';
import { type CategoryAggregateRecord } from './category-repository';

export type CurrentCategory = {
	householdId: string;
	record: CategoryAggregateRecord;
};

/**
 * Centralizes category invariants shared by create, update and archive flows.
 */
export class CategoryRules {
	public constructor(
		private readonly repository: CategoryRepository,
		private readonly householdResolver: HouseholdResolver
	) {}

	public async assertNameAvailable(
		householdId: string,
		name: string,
		currentCategoryId?: string
	): Promise<void> {
		const existingCategoryId = await this.repository.findIdByNormalizedName(
			householdId,
			normalizeCategoryIdentity(name)
		);

		if (
			existingCategoryId === undefined
			|| existingCategoryId === currentCategoryId
		) {
			return;
		}

		throw new CategoryNameConflictError();
	}

	public assertVersion(
		record: CategoryAggregateRecord,
		expectedVersion: number
	): void {
		if (record.category.version === expectedVersion) {
			return;
		}

		throw new CategoryVersionConflictError();
	}

	public async requireCurrent(
		userId: string,
		categoryId: string
	): Promise<CurrentCategory> {
		const household = await this.householdResolver.requireForUser(userId);
		const record = await this.repository.findById(household.id, categoryId);

		if (record !== undefined) {
			return {
				householdId: household.id,
				record
			};
		}

		throw new CategoryNotFoundError();
	}
}
