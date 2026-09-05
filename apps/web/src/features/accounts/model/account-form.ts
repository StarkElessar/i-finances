import type { CreateAccountInput } from '@i-finances/contracts';
import { createAccountInputSchema } from '@i-finances/contracts';

export type AccountFormFields = CreateAccountInput;

export function readAccountFields(formData: FormData): AccountFormFields | undefined {
	const initialBalance = parseMoneyToMinorUnits(readFormString(formData, 'initialBalance'));

	if (initialBalance === undefined) {
		return undefined;
	}

	const fields = {
		color: readFormString(formData, 'color'),
		currency: readFormString(formData, 'currency'),
		description: readFormString(formData, 'description'),
		initialBalanceMinor: initialBalance,
		isColorAccentEnabled: formData.get('isColorAccentEnabled') === 'on',
		isIncludedInFamilyTotal: formData.get('isIncludedInFamilyTotal') === 'on',
		name: readFormString(formData, 'name'),
		type: readFormString(formData, 'type')
	};
	const parsedFields = createAccountInputSchema.safeParse(fields);

	return parsedFields.success ? parsedFields.data : undefined;
}

export function formatMinorUnits(value: number): string {
	return (value / 100).toFixed(2);
}

export function parseMoneyToMinorUnits(value: string): number | undefined {
	const normalized = value.trim().replace(/\s/g, '').replace(',', '.');

	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
		return undefined;
	}

	const amount = Number(normalized);
	const minorUnits = Math.round(amount * 100);

	return Number.isSafeInteger(minorUnits) ? minorUnits : undefined;
}

export function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value : '';
}
