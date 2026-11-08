import { matchReceiptContact, normalizeMerchantName } from '@/modules/receipt-import/receipt-contact-matcher';

import { describe, expect, it } from 'vitest';

const CONTACTS = [
	{ id: 'c-libretik', name: 'Либретик' },
	{ id: 'c-evroopt', legalName: 'ООО "Евроторг"', name: 'Евроопт' },
	{ id: 'c-mak', name: 'Mak.by' },
	{ id: 'c-twin-1', name: 'Фикс Прайс' },
	{ id: 'c-twin-2', legalName: 'ООО «Фикс Прайс»', name: 'Fix Price' }
];

describe('normalizeMerchantName', () => {
	it('drops case, ё, quotes, punctuation and legal-form markers', () => {
		expect(normalizeMerchantName('ООО "Либретик"')).toBe('либретик');
		expect(normalizeMerchantName('  «ЛИБРЕТИК»  ')).toBe('либретик');
		expect(normalizeMerchantName('Зелёный   дом')).toBe('зеленый дом');
		expect(normalizeMerchantName('ИП Иванов И. И.')).toBe('иванов и и');
		expect(normalizeMerchantName('Mak.by')).toBe('mak by');
	});

	it('keeps a name that merely contains a marker as a part of a word', () => {
		expect(normalizeMerchantName('Уппсала')).toBe('уппсала');
	});
});

describe('matchReceiptContact', () => {
	it('matches the displayed seller name to the contact name', () => {
		expect(matchReceiptContact({ displayName: 'Либретик', legalName: null }, CONTACTS)).toBe('c-libretik');
	});

	it('matches through the legal name on either side', () => {
		expect(matchReceiptContact({ displayName: null, legalName: 'ООО "Либретик"' }, CONTACTS)).toBe('c-libretik');
		expect(matchReceiptContact({ displayName: 'Евроторг', legalName: null }, CONTACTS)).toBe('c-evroopt');
		expect(matchReceiptContact({ displayName: 'mak.BY', legalName: null }, CONTACTS)).toBe('c-mak');
	});

	it('does not guess for an unknown, empty or only partially matching seller', () => {
		expect(matchReceiptContact({ displayName: 'Неизвестная лавка', legalName: null }, CONTACTS)).toBeNull();
		expect(matchReceiptContact({ displayName: null, legalName: null }, CONTACTS)).toBeNull();
		expect(matchReceiptContact({ displayName: '   ', legalName: '""' }, CONTACTS)).toBeNull();
		expect(matchReceiptContact({ displayName: 'Либретик Минск', legalName: null }, CONTACTS)).toBeNull();
	});

	it('returns nothing when two different contacts match', () => {
		expect(matchReceiptContact({ displayName: 'Фикс Прайс', legalName: null }, CONTACTS)).toBeNull();
	});

	it('returns nothing for an empty contact list', () => {
		expect(matchReceiptContact({ displayName: 'Либретик', legalName: null }, [])).toBeNull();
	});
});
