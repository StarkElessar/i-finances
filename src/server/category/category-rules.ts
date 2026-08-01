import {
	CategoryNameConflictError,
	CategoryNotFoundError,
	CategoryVersionConflictError
} from './category-errors';
import type {
	CategoryAggregateRecord,
	CategoryRepository
} from './category-repository';

import { normalizeCategoryIdentity } from '~/entities/category/model/normalization';
import type { HouseholdResolver } from '~/server/household/household-service';

export type CurrentCategory = {
	householdId: string;
	record: CategoryAggregateRecord;
};

export type CategoryRules = {
	assertNameAvailable: (
		householdId: string,
		name: string,
		currentCategoryId?: string
	) => Promise<void>;
	assertVersion: (
		record: CategoryAggregateRecord,
		expectedVersion: number
	) => void;
	requireCurrent: (
		userId: string,
		categoryId: string
	) => Promise<CurrentCategory>;
};

/**
 * Centralizes category invariants shared by create and update use cases.
 */
export function createCategoryRules(
	repository: CategoryRepository,
	householdResolver: HouseholdResolver
): CategoryRules {
	const requireCurrent = async (
		userId: string,
		categoryId: string
	): Promise<CurrentCategory> => {
		const household = await householdResolver.requireForUser(userId);
		const record = await repository.findById(household.id, categoryId);

		if (record !== undefined) {
			return {
				householdId: household.id,
				record
			};
		}

		throw new CategoryNotFoundError();
	};

	const assertVersion = (
		record: CategoryAggregateRecord,
		expectedVersion: number
	): void => {
		if (record.category.version === expectedVersion) {
			return;
		}

		throw new CategoryVersionConflictError();
	};

	const assertNameAvailable = async (
		householdId: string,
		name: string,
		currentCategoryId?: string
	): Promise<void> => {
		const existingCategoryId = await repository.findIdByNormalizedName(
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
	};

	return {
		assertNameAvailable,
		assertVersion,
		requireCurrent
	};
}
