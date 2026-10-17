import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

/**
 * Converts between API details and the JSON stored in `accounts.details`.
 */
export interface AccountDetailsHandler {
	toFull(stored: StoredAccountDetails): Record<string, unknown>;
	toStored(input: unknown, current: StoredAccountDetails | undefined): StoredAccountDetails;
	toView(stored: StoredAccountDetails): Record<string, unknown>;
}
