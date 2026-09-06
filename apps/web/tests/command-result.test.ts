import { ApiHttpError, resolveCommandResult } from '@/shared/api';

import { contactCommandResultSchema } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

const conflictBody = {
	errorCode: 'conflict',
	fieldErrors: { name: 'Контакт с таким названием уже существует.' },
	message: 'Используйте другое название контакта.',
	ok: false
};

describe('resolveCommandResult', () => {
	it('turns a domain failure response into a value so forms can render field errors', async () => {
		const run = () => Promise.reject(
			new ApiHttpError(409, conflictBody, '/api/contacts')
		);

		await expect(resolveCommandResult(run, contactCommandResultSchema))
			.resolves.toEqual(conflictBody);
	});

	it('passes successful results through untouched', async () => {
		const success = {
			contact: {
				archivedAt: null,
				color: '#3f77a8',
				createdAt: '2026-08-08T10:00:00.000Z',
				id: 'contact/main',
				legalName: null,
				name: 'Магазин у дома',
				phone: null,
				type: 'company' as const,
				updatedAt: '2026-08-08T10:00:00.000Z',
				version: 1
			},
			ok: true as const
		};

		await expect(resolveCommandResult(() => Promise.resolve(success), contactCommandResultSchema))
			.resolves.toEqual(success);
	});

	it('rethrows responses the command schema does not recognise', async () => {
		const run = () => Promise.reject(
			new ApiHttpError(500, { error: { code: 'internal', message: 'boom' }, ok: false }, '/api/contacts')
		);

		await expect(resolveCommandResult(run, contactCommandResultSchema))
			.rejects.toBeInstanceOf(ApiHttpError);
	});

	it('rethrows errors that are not API responses at all', async () => {
		const run = () => Promise.reject(new TypeError('network down'));

		await expect(resolveCommandResult(run, contactCommandResultSchema))
			.rejects.toBeInstanceOf(TypeError);
	});
});
