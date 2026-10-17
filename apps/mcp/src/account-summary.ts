import type { PersistedAccount } from '@i-finances/contracts';

/**
 * Explicit MCP projection of an account: card details never leave the API through MCP.
 */
export function toAccountSummary(account: PersistedAccount) {
	return {
		currency: account.currency,
		id: account.id,
		name: account.name,
		owner: account.owner,
		type: account.type
	};
}
