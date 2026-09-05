import { CategoryClient } from '@/features/categories/api';

import { describe, expect, it } from 'vitest';

const category = {
	archivedAt: null,
	color: '#3f77a8',
	createdAt: '2026-07-24T10:00:00.000Z',
	description: '',
	icon: 'tag',
	id: 'category-food',
	keywords: ['магазин'],
	monthlyBudgetMinor: null,
	name: 'Продукты',
	updatedAt: '2026-07-24T10:00:00.000Z',
	version: 1
};

describe('CategoryClient', () => {
	it('keeps feature calls on the contracts-backed HTTP boundary', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/categories');
			expect(init?.method).toBe('POST');
			const body = typeof init?.body === 'string' ? init.body : '';

			expect(JSON.parse(body)).toMatchObject({
				description: 'Описание',
				keywords: ['магазин'],
				name: 'Продукты'
			});

			return new Response(JSON.stringify({ category, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new CategoryClient({ fetcher });

		await expect(client.create({
			color: '#3f77a8',
			description: '  Описание  ',
			icon: 'tag',
			keywords: [' Магазин '],
			monthlyBudgetMinor: null,
			name: '  Продукты  '
		})).resolves.toEqual({ category, ok: true });
	});

	it('encodes category IDs in command URLs', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/categories/category%2Ffood/archive');

			return new Response(JSON.stringify({ category, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new CategoryClient({ fetcher });

		await client.archive({ id: 'category/food', version: 1 });
	});
});
