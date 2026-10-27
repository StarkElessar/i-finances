import type { AccountTypeValue, CurrencyCodeValue } from '@/shared/lib';

import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { PersistedContact } from '@/entities/contact';
import type {
	Operation,
	OperationDraft
} from '@/entities/operation';

export type OperationDetailsPanelMode = 'create' | 'edit';

/**
 * An account the edit form can show in its «Счёт» field, with the balance the picker prints next to the name.
 */
export type OperationAccountChoice = {
	archived: boolean;
	balanceMinor: number;
	color: string;
	currency: CurrencyCodeValue;
	id: string;
	name: string;
	type: AccountTypeValue;
};

/**
 * Props for the home operation details panel and the reusable edit form.
 */
export type OperationDetailsPanelProps = {
	account: Account;
	/** Accounts of the household for the «Счёт» field of the edit form. */
	accountChoices: readonly OperationAccountChoice[];
	categories: readonly Category[];
	contacts: readonly PersistedContact[];
	error?: string;
	fieldErrors?: Record<string, string>;
	loading?: boolean;
	mobile: boolean;
	mode: OperationDetailsPanelMode;
	onDelete: () => void;
	onOpenChange: (open: boolean) => void;
	onPresenceChange: (present: boolean) => void;
	onRecalculateRate: () => void;
	onSubmit: (value: OperationDraft) => void;
	open: boolean;
	operation?: Operation;
};
