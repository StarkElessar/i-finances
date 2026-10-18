import { HouseholdAccessRequiredError } from '@/modules/household';

import {
	HOUSEHOLD_REQUIRED_ERROR_CODE,
	HOUSEHOLD_REQUIRED_MESSAGE,
	type HouseholdRequiredFailure
} from '@i-finances/contracts';
import type { Context } from 'hono';

import type { ApiEnvironment } from './types';

/**
 * The one HTTP mapping of «the caller has no household»: 403 `household-required` with the same body on every
 * household-scoped route. Controllers do not catch `HouseholdAccessRequiredError` themselves; it reaches the
 * application error handler, which calls this, so a new household route gets the mapping without extra code.
 *
 * Returns `undefined` for any other error.
 */
export function respondToHouseholdAccessError(
	context: Context<ApiEnvironment>,
	error: unknown
): Response | undefined {
	if (!(error instanceof HouseholdAccessRequiredError)) {
		return undefined;
	}

	return context.json<HouseholdRequiredFailure>({
		errorCode: HOUSEHOLD_REQUIRED_ERROR_CODE,
		message: HOUSEHOLD_REQUIRED_MESSAGE,
		ok: false
	}, 403);
}
