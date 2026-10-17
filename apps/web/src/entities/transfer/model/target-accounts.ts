/**
 * Lists accounts a transfer can be credited to: every account except the source.
 */
export function listTransferTargetAccounts<TAccount extends { id: string }>(
	accounts: readonly TAccount[],
	fromAccountId: string | undefined
): TAccount[] {
	return accounts.filter((account) => account.id !== fromAccountId);
}
