import { ContactClient } from '@/features/contacts/api';

import { describe, expect, it } from 'vitest';

const contact = {
	archivedAt: null,
	color: '#3f77a8',
	createdAt: '2026-08-08T10:00:00.000Z',
	id: 'contact/main',
	legalName: 'ООО «Продукты»',
	name: 'Магазин у дома',
	type: 'company',
	updatedAt: '2026-08-08T10:00:00.000Z',
	version: 1
} as const;

describe('ContactClient', () => {
	it('serializes contact list filters through the contracts-backed boundary', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/contacts?status=all');
			expect(init?.method).toBe('GET');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				items: [contact]
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new ContactClient({ fetcher });

		await expect(client.list('all')).resolves.toMatchObject({
			baseCurrency: 'BYN',
			items: [{ id: 'contact/main', name: 'Магазин у дома' }]
		});
	});

	it('encodes contact IDs and preserves optimistic-lock versions', async () => {
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			expect(input).toBe('/api/contacts/contact%2Fmain/archive');
			expect(init?.method).toBe('POST');
			expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
				id: 'contact/main',
				version: 1
			});

			return new Response(JSON.stringify({ contact, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new ContactClient({ fetcher });

		await expect(client.archive({ id: contact.id, version: contact.version })).resolves.toMatchObject({
			ok: true
		});
	});

	it('serializes create and update commands with normalized contract fields', async () => {
		const calls: Array<{ body: unknown; input: RequestInfo | URL; method: string | undefined }> = [];
		const fetcher: typeof globalThis.fetch = async (input, init) => {
			calls.push({
				body: JSON.parse(typeof init?.body === 'string' ? init.body : ''),
				input,
				method: init?.method
			});

			return new Response(JSON.stringify({ contact, ok: true }), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new ContactClient({ fetcher });

		await client.create({
			color: '#3f77a8',
			legalName: 'ООО «Продукты»',
			name: 'Магазин у дома',
			type: 'company'
		});
		await client.update({
			...contact,
			legalName: 'ООО «Продукты»',
			name: 'Магазин у дома',
			type: 'company'
		});

		expect(calls).toEqual([
			{
				body: {
					color: '#3f77a8',
					legalName: 'ООО «Продукты»',
					name: 'Магазин у дома',
					type: 'company'
				},
				input: '/api/contacts',
				method: 'POST'
			},
			{
				body: {
					color: '#3f77a8',
					id: 'contact/main',
					legalName: 'ООО «Продукты»',
					name: 'Магазин у дома',
					type: 'company',
					version: 1
				},
				input: '/api/contacts/contact%2Fmain',
				method: 'PUT'
			}
		]);
	});
});
