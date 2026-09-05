import type { AccountType } from '@i-finances/contracts';

export const accountTypeLabels: Record<AccountType, string> = {
	card: 'Карта',
	cash: 'Наличные',
	other: 'Другое',
	savings: 'Сбережения'
};
