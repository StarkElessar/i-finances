import type { CreateOperationInput } from '@i-finances/contracts';
import { createOperationInputSchema } from '@i-finances/contracts';

export type OperationFormFields = Omit<CreateOperationInput, 'accountId'>;

export function readOperationFields(
	formData: FormData,
	accountId: string
): CreateOperationInput | undefined {
	const amountMinor = parseMoneyToMinorUnits(readFormString(formData, 'amount'));

	if (amountMinor === undefined) {
		return undefined;
	}

	const parsed = createOperationInputSchema.safeParse({
		accountId,
		amountMinor,
		categoryId: readOptionalFormString(formData, 'categoryId'),
		comment: readFormString(formData, 'comment'),
		contactId: readOptionalFormString(formData, 'contactId'),
		happenedOn: readFormString(formData, 'happenedOn'),
		title: readFormString(formData, 'title'),
		type: readFormString(formData, 'type')
	});

	return parsed.success ? parsed.data : undefined;
}

export function parseMoneyToMinorUnits(value: string): number | undefined {
	const normalized = value.trim().replace(/\s/g, '').replace(',', '.');

	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
		return undefined;
	}

	const minorUnits = Math.round(Number(normalized) * 100);

	return Number.isSafeInteger(minorUnits) ? minorUnits : undefined;
}

export function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}

function readOptionalFormString(formData: FormData, name: string): string | null {
	const value = readFormString(formData, name);

	return value.length > 0 ? value : null;
}
