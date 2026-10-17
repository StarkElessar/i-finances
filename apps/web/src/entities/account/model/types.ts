import type { PersistedAccount as ContractPersistedAccount } from '@i-finances/contracts';

type DistributiveOmit<TValue, TKey extends PropertyKey> = TValue extends unknown ? Omit<TValue, TKey> : never;

/**
 * Canonical account DTO returned by the server (list representation).
 */
export type PersistedAccount = ContractPersistedAccount;

/**
 * Account without persistence metadata, used by presentational code.
 */
export type Account = DistributiveOmit<PersistedAccount, 'archivedAt' | 'createdAt' | 'hasOperations' | 'updatedAt' | 'version'>;
