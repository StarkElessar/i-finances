import { describe, expect, it } from 'vitest';

import {
	CATEGORY_ICON_IDS,
	CATEGORY_ICON_SEED_BY_NORMALIZED_NAME,
	DEFAULT_CATEGORY_ICON_ID,
	isCategoryIconId,
	resolveCategoryIconId
} from '../../../src/entities/category/model/icons';

describe('category icons registry', () => {
	it('uses tag as the default icon id', () => {
		expect(DEFAULT_CATEGORY_ICON_ID).toBe('tag');
		expect(CATEGORY_ICON_IDS.includes(DEFAULT_CATEGORY_ICON_ID)).toBe(true);
	});

	it('resolves known ids and falls back for unknown values', () => {
		expect(resolveCategoryIconId('bus')).toBe('bus');
		expect(resolveCategoryIconId('nope')).toBe('tag');
		expect(resolveCategoryIconId(undefined)).toBe('tag');
		expect(isCategoryIconId('car')).toBe(true);
		expect(isCategoryIconId('Car')).toBe(false);
	});

	it('seeds only whitelist ids and covers required normalized names', () => {
		const requiredNames = [
			'paypal оплата',
			'автомобиль',
			'аренда квартиры',
			'газ',
			'гигиена',
			'дети/игрушки/развлечения',
			'долги',
			'домашнее хозяйство',
			'домашние животные',
			'досуг',
			'еда',
			'жировка',
			'заработок',
			'здоровье',
			'канцелярия',
			'комунальные платежи',
			'красота',
			'накопление',
			'налоги',
			'неучтенка',
			'обмен валют',
			'образование',
			'обучение - автошкола',
			'одежда',
			'онлайн сервисы',
			'платежи',
			'подарок',
			'пожертвование',
			'потоковые данные',
			'продукты',
			'прокат',
			'прочие траты',
			'путешествие',
			'ремонт',
			'сервис',
			'сладости',
			'спорт',
			'страхование',
			'телефон&связь',
			'топливо',
			'транспорт',
			'фастфуд',
			'электричество'
		];

		for (const name of requiredNames) {
			expect(
				Object.prototype.hasOwnProperty.call(CATEGORY_ICON_SEED_BY_NORMALIZED_NAME, name)
			).toBe(true);
		}

		for (const iconId of Object.values(CATEGORY_ICON_SEED_BY_NORMALIZED_NAME)) {
			expect(CATEGORY_ICON_IDS.includes(iconId)).toBe(true);
		}
	});
});
