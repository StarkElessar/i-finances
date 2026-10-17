import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

import type { AccountDetailsHandler } from './account-details-handler';

/**
 * Handler for account types that have no type-specific fields yet.
 */
export class EmptyAccountDetailsHandler implements AccountDetailsHandler {
	public toFull(): Record<string, unknown> {
		return {};
	}

	public toStored(): StoredAccountDetails {
		return {};
	}

	public toView(): Record<string, unknown> {
		return {};
	}
}
