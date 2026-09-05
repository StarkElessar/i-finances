import {
	readContactFields,
	toContactFormFields
} from '@/features/contacts/model';

import { describe, expect, it } from 'vitest';

describe('contact form model', () => {
	it('normalizes company fields and excludes legal names for people', () => {
		const formData = new FormData();
		formData.set('color', '#3f77a8');
		formData.set('legalName', ' ООО «Продукты» ');
		formData.set('name', '  Магазин   у дома ');
		formData.set('type', 'company');

		expect(readContactFields(formData)).toEqual({
			color: '#3f77a8',
			legalName: 'ООО «Продукты»',
			name: 'Магазин у дома',
			phone: null,
			type: 'company'
		});

		formData.set('legalName', 'Лишнее юридическое имя');
		formData.set('type', 'person');

		expect(readContactFields(formData)).toMatchObject({
			legalName: null,
			type: 'person'
		});
	});

	it('rejects invalid color and required name', () => {
		const formData = new FormData();
		formData.set('color', 'blue');
		formData.set('name', '');
		formData.set('type', 'person');

		expect(readContactFields(formData)).toBeUndefined();
	});

	it('maps unknown persisted contacts to the editable person type', () => {
		expect(toContactFormFields({
			archivedAt: null,
			color: '#3f77a8',
			createdAt: '2026-08-08T10:00:00.000Z',
			id: 'contact/unknown',
			legalName: 'ООО «Старое имя»',
			name: 'Старый контакт',
			phone: null,
			type: 'unknown',
			updatedAt: '2026-08-08T10:00:00.000Z',
			version: 1
		})).toEqual({
			color: '#3f77a8',
			legalName: null,
			name: 'Старый контакт',
			phone: null,
			type: 'person'
		});
	});
});
