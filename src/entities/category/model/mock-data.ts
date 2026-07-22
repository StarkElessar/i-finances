import { amountToMinorUnits } from './money';
import type { Category, CategoryOperation, CategoryOperationType } from './types';

import { AccentColor, convertCurrency, CurrencyCode, type CurrencyCodeValue, type CurrencyExchangeRates } from '~/shared/lib';

export const CATEGORY_FAMILY_CURRENCY = CurrencyCode.BYN;

export const CATEGORY_EXCHANGE_RATES = {
    baseCurrency: CurrencyCode.BYN,
    ratesToBaseCurrency: {
        [CurrencyCode.USD]: 3.25,
        [CurrencyCode.EUR]: 3.75
    }
} satisfies CurrencyExchangeRates;

export const INITIAL_CATEGORIES: Category[] = [
    createInitialCategory({
        color: AccentColor.BLUE,
        id: 'groceries',
        keywords: ['евроопт', 'соседи', 'доставка'],
        monthlyBudgetMinor: amountToMinorUnits(45000),
        name: 'Продукты'
    }),
    createInitialCategory({
        color: AccentColor.SLATE,
        id: 'housing',
        keywords: ['жкх', 'аренда', 'интернет'],
        monthlyBudgetMinor: amountToMinorUnits(35000),
        name: 'Жилье и ЖКХ'
    }),
    createInitialCategory({
        color: AccentColor.GREEN,
        id: 'transport',
        keywords: ['такси', 'метро', 'топливо'],
        monthlyBudgetMinor: amountToMinorUnits(12000),
        name: 'Транспорт'
    }),
    createInitialCategory({
        color: AccentColor.ROSE,
        id: 'leisure',
        keywords: ['кино', 'кафе', 'игры'],
        monthlyBudgetMinor: amountToMinorUnits(15000),
        name: 'Досуг'
    }),
    createInitialCategory({
        color: AccentColor.VIOLET,
        id: 'health',
        keywords: ['аптека', 'врач'],
        monthlyBudgetMinor: amountToMinorUnits(8000),
        name: 'Здоровье'
    }),
    createInitialCategory({
        color: AccentColor.AMBER,
        id: 'other',
        keywords: [],
        monthlyBudgetMinor: null,
        name: 'Прочее'
    })
];

export const INITIAL_CATEGORY_OPERATIONS: CategoryOperation[] = [
    createMockOperation({
        amount: 10020,
        categoryId: 'groceries',
        currency: CurrencyCode.BYN,
        id: 'operation-groceries-1',
        title: 'Продукты на неделю',
        type: 'expense'
    }),
    createMockOperation({
        amount: 320,
        categoryId: 'housing',
        currency: CurrencyCode.USD,
        id: 'operation-housing-1',
        title: 'Аренда',
        type: 'expense'
    }),
    createMockOperation({
        amount: 34250,
        categoryId: 'housing',
        currency: CurrencyCode.BYN,
        id: 'operation-housing-2',
        title: 'Коммунальные',
        type: 'expense'
    }),
    createMockOperation({
        amount: 4090,
        categoryId: 'transport',
        currency: CurrencyCode.BYN,
        id: 'operation-transport-1',
        title: 'Такси и проезд',
        type: 'expense'
    }),
    createMockOperation({
        amount: 2400,
        categoryId: 'leisure',
        currency: CurrencyCode.BYN,
        id: 'operation-leisure-1',
        title: 'Кино и кафе',
        type: 'expense'
    }),
    createMockOperation({
        amount: 1560,
        categoryId: 'health',
        currency: CurrencyCode.BYN,
        id: 'operation-health-1',
        title: 'Аптека',
        type: 'expense'
    }),
    createMockOperation({
        amount: 120,
        categoryId: 'leisure',
        currency: CurrencyCode.USD,
        id: 'operation-leisure-income-1',
        title: 'Возврат подарка',
        type: 'income'
    })
];

type InitialCategoryParams = Pick<Category, 'color' | 'id' | 'keywords' | 'monthlyBudgetMinor' | 'name'>;

type MockOperationParams = {
    amount: number;
    categoryId: string;
    currency: CurrencyCodeValue;
    id: string;
    title: string;
    type: CategoryOperationType;
};

function createInitialCategory(params: InitialCategoryParams): Category {
    const now = new Date().toISOString();

    return {
        ...params,
        createdAt: now,
        updatedAt: now
    };
}

function createMockOperation(params: MockOperationParams): CategoryOperation {
    const amountInFamilyCurrency = convertCurrency(
        params.amount,
        params.currency,
        CATEGORY_FAMILY_CURRENCY,
        CATEGORY_EXCHANGE_RATES
    );

    return {
        amountInFamilyCurrencyMinor: amountToMinorUnits(amountInFamilyCurrency),
        amountMinor: amountToMinorUnits(params.amount),
        categoryId: params.categoryId,
        currency: params.currency,
        familyCurrency: CATEGORY_FAMILY_CURRENCY,
        happenedAt: createCurrentMonthIsoDate(),
        id: params.id,
        title: params.title,
        type: params.type
    };
}

function createCurrentMonthIsoDate(): string {
    const date = new Date();

    date.setDate(8);
    date.setHours(12, 0, 0, 0);

    return date.toISOString();
}
