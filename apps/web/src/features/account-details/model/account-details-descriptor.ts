import type { Account } from '@/entities/account';

import type { Component, JSX } from 'solid-js';

export type AccountDetailsDraft = Record<string, string>;

export type AccountDetailsFormSectionProps = {
	accentColor: string;
	disabled: boolean;
	draft: AccountDetailsDraft;
	errors: Record<string, string> | undefined;
	holder: string;
	title: string;
	onChange: (draft: AccountDetailsDraft) => void;
};

export type AccountDetailsHeaderVisualProps = {
	account: Account;
	fallback: JSX.Element;
};

/**
 * Everything the UI needs to edit and show one account type's details.
 */
export type AccountDetailsDescriptor = {
	FormSection: Component<AccountDetailsFormSectionProps>;
	HeaderVisual: Component<AccountDetailsHeaderVisualProps>;
	createDraft: (details: unknown) => AccountDetailsDraft;
	hasData: (draft: AccountDetailsDraft) => boolean;
	toInput: (draft: AccountDetailsDraft) => Record<string, string | null>;
};
