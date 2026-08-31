import type { Account } from '~/entities/account';
import type { Category } from '~/entities/category';
import type { PersistedContact } from '~/entities/contact';
import type {
	Operation,
	OperationDraft
} from '~/entities/operation';

export type OperationDetailsPanelMode = 'create' | 'edit';

/**
 * Props for the home operation details panel and the reusable edit form.
 */
export type OperationDetailsPanelProps = {
	account: Account;
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
