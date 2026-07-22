export abstract class AccountType {
    static readonly CARD = 'card' as const;

    static readonly CASH = 'cash' as const;

    static readonly OTHER = 'other' as const;

    static readonly SAVINGS = 'savings' as const;

    static values(): AccountTypeValue[] {
        return [...ACCOUNT_TYPES];
    }

    static isAccountType(value: string): value is AccountTypeValue {
        return ACCOUNT_TYPES.includes(value as AccountTypeValue);
    }
}

export const ACCOUNT_TYPES = [
    AccountType.CARD,
    AccountType.CASH,
    AccountType.SAVINGS,
    AccountType.OTHER
] as const;

export type AccountTypeValue = typeof ACCOUNT_TYPES[number];

export type AccountTypeMeta = Readonly<{
    label: string;
    description: string;
}>;

export const ACCOUNT_TYPE_META_BY_TYPE: Readonly<Record<AccountTypeValue, AccountTypeMeta>> = {
    [AccountType.CARD]: {
        label: 'Карта',
        description: 'Дебетовая или кредитная'
    },
    [AccountType.CASH]: {
        label: 'Наличные',
        description: 'Кошелёк или сейф'
    },
    [AccountType.SAVINGS]: {
        label: 'Накопления',
        description: 'Цель или подушка'
    },
    [AccountType.OTHER]: {
        label: 'Другое',
        description: 'Инвест, кредит…'
    }
};

export function getAccountTypeMeta(type: AccountTypeValue): AccountTypeMeta {
    return ACCOUNT_TYPE_META_BY_TYPE[type];
}
