import { z } from 'zod';

import { currencyCodeSchema } from './category';
import { isValidStoredPhone } from './phone';

export const CONTACT_LIST_STATUSES = ['active', 'archived', 'all'] as const;
export const contactListStatusSchema = z.enum(CONTACT_LIST_STATUSES);
export const contactTypeSchema = z.enum(['company', 'person', 'unknown']);
export const editableContactTypeSchema = z.enum(['company', 'person']);

export type ContactListStatus = z.infer<typeof contactListStatusSchema>;
export type ContactType = z.infer<typeof contactTypeSchema>;

export function normalizeContactName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function normalizeContactIdentity(value: string): string {
	return normalizeContactName(value)
		.toLocaleLowerCase('ru-BY')
		.replace(/ё/g, 'е');
}

export function normalizeContactLegalName(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	return normalizeContactName(value) || null;
}

const contactIdSchema = z.string().trim().min(1).max(128);
const contactVersionSchema = z.number().int().positive();
const contactNameSchema = z.string()
	.transform(normalizeContactName)
	.pipe(z.string().min(1, 'Укажите название контакта.').max(120));
const contactLegalNameSchema = z.union([z.string(), z.null()])
	.transform(normalizeContactLegalName)
	.pipe(z.string().max(180).nullable());
const contactPhoneSchema = z.preprocess(
	(value) => (value === undefined ? null : value),
	z.union([z.string(), z.null()])
		.transform((value) => {
			if (value === null) {
				return null;
			}

			const trimmed = value.trim();
			return trimmed.length === 0 ? null : trimmed;
		})
		.superRefine((value, context) => {
			if (value !== null && !isValidStoredPhone(value)) {
				context.addIssue({
					code: 'custom',
					message: 'Укажите корректный номер телефона.'
				});
			}
		})
);

const editableContactFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	legalName: contactLegalNameSchema,
	name: contactNameSchema,
	phone: contactPhoneSchema,
	type: editableContactTypeSchema
};

export const contactListInputSchema = z.object({
	status: contactListStatusSchema.default('active')
});

export type ContactListInput = z.infer<typeof contactListInputSchema>;

export const createContactInputSchema = z.object(editableContactFields);
export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
	...editableContactFields,
	id: contactIdSchema,
	version: contactVersionSchema
});
export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;

export const changeContactArchiveStateInputSchema = z.object({
	id: contactIdSchema,
	version: contactVersionSchema
});
export type ChangeContactArchiveStateInput = z.infer<
	typeof changeContactArchiveStateInputSchema
>;

const contactDateSchema = z.string().min(1);

export const persistedContactSchema = z.object({
	archivedAt: contactDateSchema.nullable(),
	color: z.string(),
	createdAt: contactDateSchema,
	id: contactIdSchema,
	legalName: z.string().nullable(),
	name: z.string().min(1),
	phone: z.string().nullable(),
	type: contactTypeSchema,
	updatedAt: contactDateSchema,
	version: contactVersionSchema
});

export type PersistedContact = z.infer<typeof persistedContactSchema>;

export const contactCollectionSchema = z.object({
	baseCurrency: currencyCodeSchema,
	items: z.array(persistedContactSchema)
});

export type ContactCollection = z.infer<typeof contactCollectionSchema>;

export const contactCommandErrorCodeSchema = z.enum([
	'conflict',
	'forbidden',
	'invalid-input',
	'not-found',
	'unauthenticated'
]);

export type ContactCommandErrorCode = z.infer<typeof contactCommandErrorCodeSchema>;

export const contactCommandResultSchema = z.discriminatedUnion('ok', [
	z.object({
		contact: persistedContactSchema,
		ok: z.literal(true)
	}),
	z.object({
		errorCode: contactCommandErrorCodeSchema,
		fieldErrors: z.record(z.string(), z.string()).optional(),
		message: z.string(),
		ok: z.literal(false)
	})
]);

export type ContactCommandResult = z.infer<typeof contactCommandResultSchema>;
