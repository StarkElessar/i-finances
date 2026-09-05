import {
	formatCategoryAmount,
	readCategoryFields,
	toCategoryFormFields
} from '@/features/categories/model';

import { describe, expect, it } from 'vitest';

describe('category form model', () => {
	it('normalizes category fields and parses budget in minor units', () => {
		const formData = new FormData();
		formData.set('color', '#3f77a8');
		formData.set('description', '  Для ежедневных покупок  ');
		formData.set('keywords', ' продукты, магазин\nсупермаркет ');
		formData.set('monthlyBudget', '1 250,50');
		formData.set('name', '  Продукты   ');

		expect(readCategoryFields(formData)).toEqual({
			color: '#3f77a8',
			description: 'Для ежедневных покупок',
			keywords: ['продукты', 'магазин', 'супермаркет'],
			monthlyBudgetMinor: 125_050,
			name: 'Продукты'
		});
	});

	it('allows an empty budget and rejects malformed money', () => {
		const formData = new FormData();
		formData.set('color', '#3f77a8');
		formData.set('name', 'Продукты');

		expect(readCategoryFields(formData)).toMatchObject({ monthlyBudgetMinor: null });

		formData.set('monthlyBudget', '1250.000');

		expect(readCategoryFields(formData)).toBeUndefined();
	});

	it('maps persisted category fields back to the editor', () => {
		expect(toCategoryFormFields({
			archivedAt: null,
			color: '#3f77a8',
			createdAt: '2026-08-08T10:00:00.000Z',
			description: 'Для семьи',
			id: 'category-food',
			keywords: ['продукты'],
			monthlyBudgetMinor: 125_050,
			name: 'Продукты',
			updatedAt: '2026-08-08T10:00:00.000Z',
			version: 2
		})).toEqual({
			color: '#3f77a8',
			description: 'Для семьи',
			keywords: ['продукты'],
			monthlyBudgetMinor: 125_050,
			name: 'Продукты'
		});
		expect(formatCategoryAmount(null)).toBe('');
		expect(formatCategoryAmount(125_050)).toBe('1250.50');
	});
});
