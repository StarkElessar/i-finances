import type { OperationAccountChoice } from '../types';

/**
 * What the «Счёт» field of the edit form shows, derived from the accounts the page knows about
 * (boards `M-OpMoveAccount`, `D-OpMoveAccount`).
 */
export type OperationAccountFieldState = {
	/** The account the operation lies on now; kept in the list so the trigger can show it. */
	current: OperationAccountChoice;
	/** No other active account of the currency: the field is disabled. */
	disabled: boolean;
	/** The line under the field when there is no server error. */
	hint: string;
	/** Same-currency accounts: the active ones, plus the current one when it is archived (not selectable). */
	options: OperationAccountChoice[];
	/** The account chosen in the form. */
	selected: OperationAccountChoice;
};

type OperationAccountFieldInput = {
	choices: readonly OperationAccountChoice[];
	currentAccountId: string;
	selectedAccountId: string;
};

/**
 * Builds the state of the «Счёт» field. Returns `undefined` when the current account is not among the choices, so the
 * form hides the field instead of showing a wrong one.
 */
export function resolveOperationAccountField(input: OperationAccountFieldInput): OperationAccountFieldState | undefined {
	const current = input.choices.find((choice) => choice.id === input.currentAccountId);

	if (!current) {
		return undefined;
	}

	const options = input.choices.filter((choice) => (
		choice.currency === current.currency
		&& (!choice.archived || choice.id === current.id)
	));
	const selected = options.find((choice) => choice.id === input.selectedAccountId) ?? current;
	const hasOtherAccount = options.some((choice) => !choice.archived && choice.id !== current.id);

	return {
		current,
		disabled: !hasOtherAccount,
		hint: resolveHint(current, selected, hasOtherAccount),
		options,
		selected
	};
}

/**
 * The account id to send with the update: only when the operation really goes to another account.
 */
export function resolveMovedAccountId(currentAccountId: string, selectedAccountId: string): string | undefined {
	return selectedAccountId === currentAccountId ? undefined : selectedAccountId;
}

function resolveHint(
	current: OperationAccountChoice,
	selected: OperationAccountChoice,
	hasOtherAccount: boolean
): string {
	if (!hasOtherAccount) {
		return 'Других счетов в этой валюте нет';
	}

	if (selected.id !== current.id) {
		return `Операция уйдёт со счёта «${current.name}» и появится на счёте «${selected.name}». Балансы обоих счетов пересчитаются`;
	}

	return current.archived
		? `Показаны активные счета в той же валюте (${current.currency})`
		: `Показаны счета в той же валюте (${current.currency})`;
}
