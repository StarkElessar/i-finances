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

/**
 * Canonical account DTO returned by the server persistence layer.
 */
export type PersistedAccount = Account & {
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
    version: number;
};
