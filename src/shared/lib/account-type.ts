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
    AccountType.OTHER,
    AccountType.SAVINGS
] as const;

export type AccountTypeValue = typeof ACCOUNT_TYPES[number];

export type AccountTypeMeta = Readonly<{
    label: string;
}>;

export const ACCOUNT_TYPE_META_BY_TYPE: Readonly<Record<AccountTypeValue, AccountTypeMeta>> = {
    [AccountType.CARD]: {
        label: 'Карта'
    },
    [AccountType.CASH]: {
        label: 'Наличные'
    },
    [AccountType.OTHER]: {
        label: 'Другое'
    },
    [AccountType.SAVINGS]: {
        label: 'Накопления'
    }
};

export function getAccountTypeMeta(type: AccountTypeValue): AccountTypeMeta {
    return ACCOUNT_TYPE_META_BY_TYPE[type];
}
