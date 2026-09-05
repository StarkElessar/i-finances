import type { ContactType } from '@i-finances/contracts';

export const contactTypeLabels: Record<ContactType, string> = {
	company: 'Компания',
	person: 'Частное лицо',
	unknown: 'Неизвестный тип'
};
