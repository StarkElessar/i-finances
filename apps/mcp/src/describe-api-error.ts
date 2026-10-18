import { ApiRequestError } from '@/api-request-error';

import { isHouseholdRequiredFailure } from '@i-finances/contracts';

/**
 * Shown when the API answers `household-required`: the user behind `MCP_USER_ID` is not a member of any household,
 * so no household data can be read or recorded until that is fixed on the server, not in the conversation.
 */
export const MCP_HOUSEHOLD_REQUIRED_MESSAGE = 'The MCP user is not a member of any household, so i-finances has no data '
	+ 'to read or record for it. The household owner has to fix this on the API server: add that user to the household, '
	+ 'or set MCP_USER_ID to the id of a household member (normally the owner) and restart the API. '
	+ 'Retrying the tool will not help.';

/**
 * Turns a failed tool call into the text returned to the agent.
 */
export function describeApiError(error: unknown): string {
	if (error instanceof ApiRequestError) {
		if (isHouseholdRequiredFailure(error.body)) {
			return MCP_HOUSEHOLD_REQUIRED_MESSAGE;
		}

		const body = error.body as { message?: string } | undefined;

		return body?.message ?? `API request failed with status ${error.status}`;
	}

	return error instanceof Error ? error.message : String(error);
}
