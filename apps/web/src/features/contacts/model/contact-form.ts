import type {
	CreateContactInput,
	PersistedContact
} from '@i-finances/contracts';
import { createContactInputSchema } from '@i-finances/contracts';

export type ContactFormFields = CreateContactInput;

export function readContactFields(formData: FormData): ContactFormFields | undefined {
	const type = readFormString(formData, 'type');
	const fields = {
		color: readFormString(formData, 'color'),
		legalName: type === 'company' ? readFormString(formData, 'legalName') || null : null,
		name: readFormString(formData, 'name'),
		phone: readFormString(formData, 'phone') || null,
		type
	};
	const parsedFields = createContactInputSchema.safeParse(fields);

	return parsedFields.success ? parsedFields.data : undefined;
}

export function toContactFormFields(contact: PersistedContact): ContactFormFields {
	return {
		color: contact.color,
		legalName: contact.type === 'company' ? contact.legalName : null,
		name: contact.name,
		phone: contact.phone,
		type: contact.type === 'company' ? 'company' : 'person'
	};
}

export function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}
