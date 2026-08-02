import {
	normalizeContactLegalName,
	normalizeContactName
} from '~/entities/contact/model/normalization';
import type { PersistedContact } from '~/entities/contact/model/types';

import { z } from 'zod';

export const CONTACT_LIST_STATUSES = [
	'active',
	'archived',
	'all'
] as const;

export const EDITABLE_CONTACT_TYPES = [
	'person',
	'company'
] as const;

const contactIdSchema = z.string().trim().min(1).max(128);
const contactVersionSchema = z.number().int().positive();
const contactNameSchema = z.string()
	.transform(normalizeContactName)
	.pipe(z.string().min(1, 'Укажите название контакта.').max(120));
const contactLegalNameSchema = z.union([z.string(), z.null()])
	.transform(normalizeContactLegalName)
	.pipe(z.string().max(180).nullable());

const editableContactFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	legalName: contactLegalNameSchema,
	name: contactNameSchema,
	type: z.enum(EDITABLE_CONTACT_TYPES)
};

/**
 * Validates contact list filtering.
 */
export const contactListInputSchema = z.object({
	status: z.enum(CONTACT_LIST_STATUSES).default('active')
});

/**
 * Validates creation of one household contact.
 */
export const createContactInputSchema = z.object(editableContactFields);

/**
 * Validates a complete contact update with an optimistic-lock version.
 */
export const updateContactInputSchema = z.object({
	...editableContactFields,
	id: contactIdSchema,
	version: contactVersionSchema
});

/**
 * Validates archive and restore commands.
 */
export const changeContactArchiveStateInputSchema = z.object({
	id: contactIdSchema,
	version: contactVersionSchema
});

export type ContactListInput = z.infer<typeof contactListInputSchema>;
export type ContactListStatus = ContactListInput['status'];
export type CreateContactInput = z.infer<typeof createContactInputSchema>;
export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
export type ChangeContactArchiveStateInput = z.infer<
	typeof changeContactArchiveStateInputSchema
>;

export type ContactCommandErrorCode =
	| 'conflict'
	| 'forbidden'
	| 'invalid-input'
	| 'not-found'
	| 'unauthenticated';

export type ContactCommandResult =
	| {
		contact: PersistedContact;
		ok: true;
	}
	| {
		errorCode: ContactCommandErrorCode;
		fieldErrors?: Record<string, string>;
		message: string;
		ok: false;
	};
