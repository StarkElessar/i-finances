import { action, query, revalidate } from '@solidjs/router';
import { getWebRequest } from '@solidjs/start/http';
import type { z } from 'zod';

import type {
	ChangeContactArchiveStateInput,
	ContactCommandResult,
	ContactListInput,
	CreateContactInput,
	UpdateContactInput
} from './contact.contract';
import {
	changeContactArchiveStateInputSchema,
	contactListInputSchema,
	createContactInputSchema,
	updateContactInputSchema
} from './contact.contract';

import type {
	ContactCollection,
	PersistedContact
} from '~/entities/contact/model/types';
import {
	assertSameOriginMutation,
	InvalidMutationOriginError
} from '~/server/auth/csrf/origin-guard';
import {
	AuthenticationRequiredError,
	requireUser
} from '~/server/auth/require-user';
import {
	ContactNameConflictError,
	ContactNotFoundError,
	ContactVersionConflictError
} from '~/server/contact/contact-errors';
import { createContactRepository } from '~/server/contact/contact-repository';
import { createContactService } from '~/server/contact/contact-service';
import { createHouseholdRepository } from '~/server/household/household-repository';
import {
	createHouseholdResolver,
	HouseholdAccessRequiredError,
	HouseholdSelectionRequiredError
} from '~/server/household/household-service';

const contactService = createContactService({
	contactRepository: createContactRepository(),
	householdResolver: createHouseholdResolver(createHouseholdRepository())
});

/**
 * Loads contacts available to the current household.
 */
async function readContacts(
	input: ContactListInput
): Promise<ContactCollection> {
	'use server';

	const parsedInput = contactListInputSchema.parse(input);
	const session = await requireUser();

	return contactService.list(session.user.id, parsedInput.status);
}

export const getContacts = query(readContacts, 'contacts');

/**
 * Converts Zod errors to the flat field shape consumed by forms.
 */
function createFieldErrors(error: z.ZodError): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	error.issues.forEach((issue) => {
		const field = issue.path[0];

		if (typeof field === 'string') {
			fieldErrors[field] = issue.message;
		}
	});

	return fieldErrors;
}

/**
 * Maps known contact failures to a stable action result.
 */
function createContactFailure(
	error: unknown
): ContactCommandResult | undefined {
	if (error instanceof AuthenticationRequiredError) {
		return {
			errorCode: 'unauthenticated',
			message: 'Требуется войти в приложение.',
			ok: false
		};
	}

	if (
		error instanceof InvalidMutationOriginError
		|| error instanceof HouseholdAccessRequiredError
	) {
		return {
			errorCode: 'forbidden',
			message: 'Недостаточно прав для изменения контактов.',
			ok: false
		};
	}

	if (error instanceof ContactNameConflictError) {
		return {
			errorCode: 'conflict',
			fieldErrors: {
				name: 'Контакт с таким названием уже существует.'
			},
			message: 'Используйте другое название контакта.',
			ok: false
		};
	}

	if (
		error instanceof ContactVersionConflictError
		|| error instanceof HouseholdSelectionRequiredError
	) {
		return {
			errorCode: 'conflict',
			message: 'Данные изменились. Обновите контакты и повторите действие.',
			ok: false
		};
	}

	if (error instanceof ContactNotFoundError) {
		return {
			errorCode: 'not-found',
			message: 'Контакт не найден.',
			ok: false
		};
	}

	return undefined;
}

/**
 * Executes one validated contact command in the authenticated request context.
 */
async function executeContactCommand<TInput>(
	schema: z.ZodType<TInput>,
	input: TInput,
	command: (userId: string, value: TInput) => Promise<PersistedContact>
): Promise<ContactCommandResult> {
	const parsedInput = schema.safeParse(input);

	if (parsedInput.success) {
		try {
			assertSameOriginMutation(getWebRequest());

			const session = await requireUser();
			const contact = await command(session.user.id, parsedInput.data);

			await revalidate(getContacts.key);

			return {
				contact,
				ok: true
			};
		}
		catch (error: unknown) {
			const failure = createContactFailure(error);

			if (failure !== undefined) {
				return failure;
			}

			throw error;
		}
	}

	return {
		errorCode: 'invalid-input',
		fieldErrors: createFieldErrors(parsedInput.error),
		message: 'Проверьте поля контакта.',
		ok: false
	};
}

async function createContactCommand(
	input: CreateContactInput
): Promise<ContactCommandResult> {
	'use server';

	return executeContactCommand(
		createContactInputSchema,
		input,
		contactService.create
	);
}

async function updateContactCommand(
	input: UpdateContactInput
): Promise<ContactCommandResult> {
	'use server';

	return executeContactCommand(
		updateContactInputSchema,
		input,
		contactService.update
	);
}

async function archiveContactCommand(
	input: ChangeContactArchiveStateInput
): Promise<ContactCommandResult> {
	'use server';

	return executeContactCommand(
		changeContactArchiveStateInputSchema,
		input,
		contactService.archive
	);
}

async function restoreContactCommand(
	input: ChangeContactArchiveStateInput
): Promise<ContactCommandResult> {
	'use server';

	return executeContactCommand(
		changeContactArchiveStateInputSchema,
		input,
		contactService.restore
	);
}

export const createContact = action(createContactCommand, 'create-contact');
export const updateContact = action(updateContactCommand, 'update-contact');
export const archiveContact = action(archiveContactCommand, 'archive-contact');
export const restoreContact = action(restoreContactCommand, 'restore-contact');
