/**
 * Curated Lucide-backed icon ids allowed for categories.
 */
export const CATEGORY_ICON_IDS = [
	'tag',
	'shapes',
	'circle',
	'star',
	'heart',
	'bookmark',
	'utensils',
	'shopping-cart',
	'sandwich',
	'candy',
	'coffee',
	'wine',
	'bus',
	'car',
	'fuel',
	'bike',
	'plane',
	'train-front',
	'home',
	'building-2',
	'key-round',
	'wrench',
	'hammer',
	'zap',
	'flame',
	'droplets',
	'wifi',
	'phone',
	'monitor',
	'tv',
	'shirt',
	'sparkles',
	'scan-face',
	'stethoscope',
	'pill',
	'dumbbell',
	'baby',
	'gamepad-2',
	'party-popper',
	'gift',
	'paw-print',
	'graduation-cap',
	'book-open',
	'briefcase',
	'wallet',
	'piggy-bank',
	'banknote',
	'receipt',
	'landmark',
	'scale',
	'hand-coins',
	'arrow-left-right',
	'shield',
	'file-text',
	'ellipsis'
] as const;

/**
 * Whitelist id stored on a category and accepted by create/update contracts.
 */
export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number];

/**
 * Default icon when create form is untouched or value is unknown.
 */
export const DEFAULT_CATEGORY_ICON_ID: CategoryIconId = 'tag';

const CATEGORY_ICON_ID_SET = new Set<string>(CATEGORY_ICON_IDS);

/**
 * Type guard for whitelist icon ids.
 */
export function isCategoryIconId(value: string): value is CategoryIconId {
	return CATEGORY_ICON_ID_SET.has(value);
}

/**
 * Returns a safe category icon id, falling back to the default.
 */
export function resolveCategoryIconId(value: string | null | undefined): CategoryIconId {
	if (value && isCategoryIconId(value)) {
		return value;
	}

	return DEFAULT_CATEGORY_ICON_ID;
}

/**
 * One-time seed targets keyed by category `normalized_name`.
 */
export const CATEGORY_ICON_SEED_BY_NORMALIZED_NAME = {
	'paypal оплата': 'banknote',
	'автомобиль': 'car',
	'аренда квартиры': 'key-round',
	'газ': 'flame',
	'гигиена': 'sparkles',
	'дети/игрушки/развлечения': 'baby',
	'долги': 'scale',
	'домашнее хозяйство': 'home',
	'домашние животные': 'paw-print',
	'досуг': 'party-popper',
	'еда': 'utensils',
	'жировка': 'building-2',
	'заработок': 'briefcase',
	'здоровье': 'stethoscope',
	'канцелярия': 'file-text',
	'комунальные платежи': 'home',
	'красота': 'scan-face',
	'накопление': 'piggy-bank',
	'налоги': 'landmark',
	'неучтенка': 'ellipsis',
	'обмен валют': 'arrow-left-right',
	'образование': 'graduation-cap',
	'обучение - автошкола': 'car',
	'одежда': 'shirt',
	'онлайн сервисы': 'monitor',
	'платежи': 'receipt',
	'подарок': 'gift',
	'пожертвование': 'hand-coins',
	'потоковые данные': 'tv',
	'продукты': 'shopping-cart',
	'прокат': 'key-round',
	'прочие траты': 'shapes',
	'путешествие': 'plane',
	'ремонт': 'hammer',
	'сервис': 'wrench',
	'сладости': 'candy',
	'спорт': 'dumbbell',
	'страхование': 'shield',
	'телефон&связь': 'phone',
	'топливо': 'fuel',
	'транспорт': 'bus',
	'фастфуд': 'sandwich',
	'электричество': 'zap'
} as const satisfies Readonly<Record<string, CategoryIconId>>;
