import type { Account } from './types';

import { AccountColor, AccountType, amountToMinorUnits, CurrencyCode } from '~/shared/lib';

export const CASH_ACCOUNT_ID = 'cash-byn';

export const INITIAL_ACCOUNTS: Account[] = [
    {
        color: AccountColor.GREEN,
        currency: CurrencyCode.BYN,
        description: 'Семья',
        id: CASH_ACCOUNT_ID,
        initialBalanceMinor: amountToMinorUnits(-7.73),
        isColorAccentEnabled: true,
        isIncludedInFamilyTotal: true,
        name: 'Наличные',
        type: AccountType.CASH
    },
    {
        color: AccountColor.BLUE,
        currency: CurrencyCode.USD,
        description: 'Семья',
        id: 'reserve-usd',
        initialBalanceMinor: amountToMinorUnits(5_550),
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: true,
        name: 'НЗ USD',
        type: AccountType.SAVINGS
    },
    {
        color: AccountColor.VIOLET,
        currency: CurrencyCode.EUR,
        description: 'Личный резерв',
        id: 'reserve-eur',
        initialBalanceMinor: amountToMinorUnits(2_825),
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: true,
        name: 'НЗ EUR',
        type: AccountType.SAVINGS
    },
    {
        color: AccountColor.SLATE,
        currency: CurrencyCode.USD,
        description: 'Биржа',
        id: 'bybit-usdt',
        initialBalanceMinor: amountToMinorUnits(127),
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: false,
        name: 'USDT ByBit',
        type: AccountType.OTHER
    }
];
