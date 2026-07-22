import type { AccountTypeValue, CurrencyCodeValue } from '~/shared/lib';

export type Account = {
    color: string;
    currency: CurrencyCodeValue;
    description: string;
    id: string;
    initialBalanceMinor: number;
    isColorAccentEnabled: boolean;
    isIncludedInFamilyTotal: boolean;
    name: string;
    type: AccountTypeValue;
};
