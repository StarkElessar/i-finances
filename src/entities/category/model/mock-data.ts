import type { Category } from './types';

import { INITIAL_OPERATION_CATEGORIES } from '~/entities/operation';
import { AccentColor, amountToMinorUnits, CurrencyCode } from '~/shared/lib';

export const CATEGORY_FAMILY_CURRENCY = CurrencyCode.BYN;

const FIXTURE_TIMESTAMP = '2026-01-01T12:00:00.000Z';

type CategoryPreset = {
    color: string;
    id: string;
    monthlyBudgetMinor: number | null;
    name: string;
};

const CATEGORY_PRESETS: CategoryPreset[] = [
    {
        color: AccentColor.BLUE,
        id: 'groceries',
        monthlyBudgetMinor: amountToMinorUnits(45_000),
        name: 'Продукты'
    },
    {
        color: AccentColor.SLATE,
        id: 'housing',
        monthlyBudgetMinor: amountToMinorUnits(35_000),
        name: 'Жилье и ЖКХ'
    },
    {
        color: AccentColor.GREEN,
        id: 'transport',
        monthlyBudgetMinor: amountToMinorUnits(12_000),
        name: 'Транспорт'
    },
    {
        color: AccentColor.ROSE,
        id: 'leisure',
        monthlyBudgetMinor: amountToMinorUnits(15_000),
        name: 'Досуг'
    },
    {
        color: AccentColor.VIOLET,
        id: 'health',
        monthlyBudgetMinor: amountToMinorUnits(8_000),
        name: 'Здоровье'
    },
    {
        color: AccentColor.AMBER,
        id: 'other',
        monthlyBudgetMinor: null,
        name: 'Прочее'
    }
];

const presetByName = new Map(CATEGORY_PRESETS.map((preset) => [preset.name, preset]));
const importedCategoryNames = new Set(INITIAL_OPERATION_CATEGORIES.map((category) => category.name));

export const INITIAL_CATEGORIES: Category[] = [
    ...INITIAL_OPERATION_CATEGORIES.map((category) => {
        const preset = presetByName.get(category.name);

        return createInitialCategory({
            color: preset?.color ?? category.color,
            id: category.id,
            monthlyBudgetMinor: preset?.monthlyBudgetMinor ?? null,
            name: category.name
        });
    }),
    ...CATEGORY_PRESETS
        .filter((preset) => !importedCategoryNames.has(preset.name))
        .map(createInitialCategory)
];

function createInitialCategory(
    params: Pick<Category, 'color' | 'id' | 'monthlyBudgetMinor' | 'name'>
): Category {
    return {
        ...params,
        createdAt: FIXTURE_TIMESTAMP,
        keywords: [],
        updatedAt: FIXTURE_TIMESTAMP
    };
}
