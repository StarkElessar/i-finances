import type { AccountType } from '@i-finances/contracts';

import type { AccountDetailsHandler } from './account-details-handler';
import { CardAccountDetailsHandler } from './card-account-details-handler';
import { EmptyAccountDetailsHandler } from './empty-account-details-handler';

const emptyHandler = new EmptyAccountDetailsHandler();

/**
 * Exhaustive registry: adding a type to `accountTypeSchema` fails the build until it is listed here.
 */
export const ACCOUNT_DETAILS_HANDLERS: Record<AccountType, AccountDetailsHandler> = {
	card: new CardAccountDetailsHandler(),
	cash: emptyHandler,
	other: emptyHandler,
	savings: emptyHandler
};
