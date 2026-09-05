import { randomUUID } from 'node:crypto';

import type { HouseholdResolver } from '@/modules/household';

import {
	type CategoryCollection,
	type CategoryListStatus,
	type ChangeCategoryArchiveStateInput,
	type CreateCategoryInput,
	normalizeCategoryIdentity,
	normalizeCategoryName,
	type PersistedCategory,
	type PublicCategory,
	type UpdateCategoryInput
} from '@i-finances/contracts';

import { CategoryNameConflictError, CategoryVersionConflictError } from './category-errors';
import {
	createCategoryKeywordRecords,
	toPersistedCategory,
	toPublicCategory
} from './category-mappers';
import type { CategoryRepository } from './category-repository';
import { CategoryRules } from './category-rules';

export type CategoryServiceDependencies = {
	categoryRepository: CategoryRepository;
	householdResolver: HouseholdResolver;
	createId?: () => string;
	now?: () => Date;
};

export class CategoryService {
	private readonly createId: () => string;
	private readonly now: () => Date;
	private readonly rules: CategoryRules;

	public constructor(dependencies: CategoryServiceDependencies) {
		this.createId = dependencies.createId ?? randomUUID;
		this.now = dependencies.now ?? (() => new Date());
		this.rules = new CategoryRules(
			dependencies.categoryRepository,
			dependencies.householdResolver
		);
		this.categoryRepository = dependencies.categoryRepository;
		this.householdResolver = dependencies.householdResolver;
	}

	private readonly categoryRepository: CategoryRepository;
	private readonly householdResolver: HouseholdResolver;

	public async list(
		userId: string,
		status: CategoryListStatus
	): Promise<CategoryCollection> {
		const household = await this.householdResolver.requireForUser(userId);
		const records = await this.categoryRepository.list(household.id, status);

		return {
			baseCurrency: household.baseCurrency,
			items: records.map(toPersistedCategory)
		};
	}

	public async listPublic(householdId: string): Promise<PublicCategory[]> {
		const records = await this.categoryRepository.list(householdId, 'active');

		return records.map(toPublicCategory);
	}

	public async create(
		userId: string,
		input: CreateCategoryInput
	): Promise<PersistedCategory> {
		const household = await this.householdResolver.requireForUser(userId);
		const categoryId = this.createId();
		const timestamp = this.now();
		const name = normalizeCategoryName(input.name);

		await this.rules.assertNameAvailable(household.id, name);

		const record = await this.categoryRepository.insert(
			{
				archivedAt: null,
				color: input.color,
				createdAt: timestamp,
				createdByUserId: userId,
				description: input.description,
				householdId: household.id,
				id: categoryId,
				monthlyBudgetMinor: input.monthlyBudgetMinor,
				name,
				normalizedName: normalizeCategoryIdentity(name),
				updatedAt: timestamp,
				version: 1
			},
			createCategoryKeywordRecords(categoryId, input.keywords)
		);

		if (record === undefined) {
			throw new CategoryNameConflictError();
		}

		return toPersistedCategory(record);
	}

	public async update(
		userId: string,
		input: UpdateCategoryInput
	): Promise<PersistedCategory> {
		const current = await this.rules.requireCurrent(userId, input.id);
		const name = normalizeCategoryName(input.name);

		this.rules.assertVersion(current.record, input.version);
		await this.rules.assertNameAvailable(current.householdId, name, input.id);

		const record = await this.categoryRepository.update(
			current.householdId,
			input.id,
			input.version,
			{
				color: input.color,
				description: input.description,
				monthlyBudgetMinor: input.monthlyBudgetMinor,
				name,
				normalizedName: normalizeCategoryIdentity(name),
				updatedAt: this.now()
			},
			createCategoryKeywordRecords(input.id, input.keywords)
		);

		if (record === undefined) {
			throw new CategoryVersionConflictError();
		}

		return toPersistedCategory(record);
	}

	public async archive(
		userId: string,
		input: ChangeCategoryArchiveStateInput
	): Promise<PersistedCategory> {
		return this.changeArchiveState(userId, input, true);
	}

	public async restore(
		userId: string,
		input: ChangeCategoryArchiveStateInput
	): Promise<PersistedCategory> {
		return this.changeArchiveState(userId, input, false);
	}

	private async changeArchiveState(
		userId: string,
		input: ChangeCategoryArchiveStateInput,
		targetArchived: boolean
	): Promise<PersistedCategory> {
		const current = await this.rules.requireCurrent(userId, input.id);

		this.rules.assertVersion(current.record, input.version);

		const currentlyArchived = current.record.category.archivedAt !== null;

		if (currentlyArchived === targetArchived) {
			return toPersistedCategory(current.record);
		}

		const timestamp = this.now();
		const record = await this.categoryRepository.setArchivedAt(
			current.householdId,
			input.id,
			input.version,
			targetArchived ? timestamp : null,
			timestamp
		);

		if (record === undefined) {
			throw new CategoryVersionConflictError();
		}

		return toPersistedCategory(record);
	}
}
