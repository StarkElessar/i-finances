import type { Account } from '@/entities/account';
import type { Operation } from '@/entities/operation';

import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { OperationDetailsPanel } from './operation-details-panel';
import type { OperationAccountChoice } from './types';

const CASH: OperationAccountChoice = {
	archived: false,
	balanceMinor: 630_151,
	color: '#2f8f83',
	currency: 'BYN',
	id: 'account-cash',
	name: 'Общая наличка',
	type: 'cash'
};

const NORTH: OperationAccountChoice = {
	archived: false,
	balanceMinor: 48_998,
	color: '#3f77a8',
	currency: 'BYN',
	id: 'account-north',
	name: 'Карта Север',
	type: 'card'
};

const WIFE: OperationAccountChoice = {
	archived: false,
	balanceMinor: 115_240,
	color: '#c4572f',
	currency: 'BYN',
	id: 'account-wife',
	name: 'Карта жены Беларусбанк',
	type: 'card'
};

const USD_CASH: OperationAccountChoice = {
	archived: false,
	balanceMinor: 120_000,
	color: '#5b8c3a',
	currency: 'USD',
	id: 'account-usd',
	name: 'Нал USD',
	type: 'cash'
};

const OLD_CARD: OperationAccountChoice = {
	archived: true,
	balanceMinor: 0,
	color: '#7d8799',
	currency: 'BYN',
	id: 'account-old',
	name: 'Старая карта',
	type: 'card'
};

function toAccount(choice: OperationAccountChoice): Account {
	return {
		color: choice.color,
		currency: choice.currency,
		description: '',
		details: {},
		id: choice.id,
		initialBalanceMinor: 0,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: choice.name,
		owner: '',
		type: choice.type
	} as Account;
}

function operationOn(choice: OperationAccountChoice, overrides: Partial<Operation> = {}): Operation {
	return {
		accountId: choice.id,
		amountInHouseholdBaseCurrencyMinor: 2_120,
		amountMinor: 2_120,
		categoryId: null,
		categoryName: null,
		comment: '',
		contactId: null,
		contactName: null,
		createdAt: '2026-10-11T08:00:00.000Z',
		currency: choice.currency,
		deletedAt: null,
		deletedByUserId: null,
		exchangeRate: {
			effectiveOn: '2026-10-11',
			fromCurrency: choice.currency,
			rate: '1',
			source: 'identity',
			toCurrency: choice.currency
		},
		happenedOn: '2026-10-11',
		householdBaseCurrency: 'BYN',
		id: 'operation-1',
		sourceOrder: 1,
		title: 'Хлеб и молоко',
		transferId: null,
		type: 'expense',
		updatedAt: '2026-10-11T08:00:00.000Z',
		version: 1,
		...overrides
	};
}

async function openAccountPicker(canvasElement: HTMLElement): Promise<void> {
	const body = within(canvasElement.ownerDocument.body);

	await userEvent.click(await body.findByRole('combobox', { name: /Счёт/ }));
	await body.findByRole('listbox');
}

// The edit form of the boards `M-OpMoveAccount`, `D-OpMoveAccount` inside the real panel (a drawer: full width on the phone).
const meta = {
	title: 'Home/OperationDetailsPanel',
	component: OperationDetailsPanel,
	args: {
		account: toAccount(CASH),
		accountChoices: [CASH, NORTH, WIFE, USD_CASH, OLD_CARD],
		categories: [],
		contacts: [],
		mobile: true,
		mode: 'edit',
		onDelete: fn(),
		onOpenChange: fn(),
		onPresenceChange: fn(),
		onRecalculateRate: fn(),
		onSubmit: fn(),
		open: true,
		operation: operationOn(CASH)
	},
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof OperationDetailsPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Closed field: the current account, the currency line under it. */
export const AccountField: Story = {};

/** The picker is open: only active accounts in BYN, the current one with a check and «Текущий счёт». */
export const AccountPickerOpen: Story = {
	play: async ({ canvasElement }) => {
		await openAccountPicker(canvasElement);
	}
};

/** Another account is chosen: the hint names both accounts. */
export const AccountChanged: Story = {
	play: async ({ canvasElement }) => {
		await openAccountPicker(canvasElement);
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: /Карта жены/ }));
		await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByText(/Операция уйдёт со счёта/)).toBeTruthy());
	}
};

/** The server refused the account (409): the message sits under the field, the frame is red, Save stays on. */
export const AccountRejected: Story = {
	args: {
		error: 'Операцию можно перенести только на счёт в той же валюте.',
		fieldErrors: { accountId: 'Операцию можно перенести только на счёт в той же валюте.' }
	}
};

/** The account is no longer available (409 `reference-unavailable`). */
export const AccountUnavailable: Story = {
	args: {
		error: 'Счёт недоступен.',
		fieldErrors: { accountId: 'Счёт недоступен.' }
	}
};

/** No connection: the banner above Save, the field keeps the chosen account and its hint. */
export const SaveFailed: Story = {
	args: { error: 'Не удалось сохранить операцию. Проверьте соединение и повторите.' },
	play: async ({ canvasElement }) => {
		await openAccountPicker(canvasElement);
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name: /Карта Север/ }));
	}
};

/** The only account in its currency: the field is disabled with an explanation. */
export const SingleAccountInCurrency: Story = {
	args: {
		account: toAccount(USD_CASH),
		operation: operationOn(USD_CASH)
	}
};

/** One leg of a transfer cannot be edited: no «Счёт» field, only «Закрыть». */
export const TransferPart: Story = {
	args: {
		operation: operationOn(CASH, {
			amountMinor: 10_000,
			title: 'Перевод на «Нал USD»',
			transferId: 'transfer-1'
		})
	}
};

/** The operation lies on an archived account: it stays visible and muted with «Архив», the list offers active accounts only. */
export const ArchivedAccount: Story = {
	args: {
		account: toAccount(OLD_CARD),
		operation: operationOn(OLD_CARD)
	},
	play: async ({ canvasElement }) => {
		await openAccountPicker(canvasElement);
	}
};

/** The form is saving: the field is locked together with the others. */
export const Saving: Story = {
	args: { loading: true }
};

/** A new operation has no «Счёт» field: it goes to the account selected on the screen. */
export const CreateWithoutAccountField: Story = {
	args: { mode: 'create', operation: undefined }
};
