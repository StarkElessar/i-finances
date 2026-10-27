import type { PersistedAccount } from '@/entities/account';
import { updateOperationInputSchema } from '@/entities/operation/api/operation.contract';

import { buildOperationAccountChoices } from '@/views/home/ui/operation-details-panel/lib/build-operation-account-choices';
import { formatDateKey } from '@/views/home/ui/operation-details-panel/lib/format-date-key';
import {
	resolveMovedAccountId,
	resolveOperationAccountField
} from '@/views/home/ui/operation-details-panel/lib/resolve-operation-account-field';
import type { OperationAccountChoice } from '@/views/home/ui/operation-details-panel/types';

import { describe, expect, it } from 'vitest';

function choice(overrides: Partial<OperationAccountChoice> & { id: string }): OperationAccountChoice {
	return {
		archived: false,
		balanceMinor: 100_00,
		color: '#3f77a8',
		currency: 'BYN',
		name: overrides.id,
		type: 'card',
		...overrides
	};
}

const cash = choice({ id: 'cash', name: 'Общая наличка', type: 'cash' });
const north = choice({ id: 'north', name: 'Карта Север' });
const wife = choice({ id: 'wife', name: 'Карта жены Беларусбанк' });
const usd = choice({ currency: 'USD', id: 'usd', name: 'Нал USD' });
const oldCard = choice({ archived: true, id: 'old', name: 'Старая карта' });
const archivedOther = choice({ archived: true, id: 'other-old', name: 'Другая старая' });

describe('resolveOperationAccountField', () => {
	it('offers only active accounts of the same currency, the current one included', () => {
		const field = resolveOperationAccountField({
			choices: [cash, north, wife, usd, archivedOther],
			currentAccountId: 'cash',
			selectedAccountId: 'cash'
		});

		expect(field?.options.map((option) => option.id)).toEqual(['cash', 'north', 'wife']);
		expect(field?.current.id).toBe('cash');
		expect(field?.selected.id).toBe('cash');
		expect(field?.disabled).toBe(false);
	});

	it('hints at the currency while the account is not changed', () => {
		const field = resolveOperationAccountField({
			choices: [cash, north],
			currentAccountId: 'cash',
			selectedAccountId: 'cash'
		});

		expect(field?.hint).toBe('Показаны счета в той же валюте (BYN)');
	});

	it('names both accounts once another one is chosen', () => {
		const field = resolveOperationAccountField({
			choices: [cash, north, wife],
			currentAccountId: 'cash',
			selectedAccountId: 'wife'
		});

		expect(field?.selected.id).toBe('wife');
		expect(field?.hint).toBe(
			'Операция уйдёт со счёта «Общая наличка» и появится на счёте «Карта жены Беларусбанк». '
			+ 'Балансы обоих счетов пересчитаются'
		);
	});

	it('disables the field when the currency has no other active account', () => {
		const field = resolveOperationAccountField({
			choices: [cash, usd, archivedOther],
			currentAccountId: 'cash',
			selectedAccountId: 'cash'
		});

		expect(field?.disabled).toBe(true);
		expect(field?.hint).toBe('Других счетов в этой валюте нет');
	});

	it('keeps an archived current account visible but not selectable, and talks about active accounts', () => {
		const field = resolveOperationAccountField({
			choices: [cash, north, oldCard, archivedOther],
			currentAccountId: 'old',
			selectedAccountId: 'old'
		});

		expect(field?.options.map((option) => option.id)).toEqual(['cash', 'north', 'old']);
		expect(field?.options.find((option) => option.id === 'old')?.archived).toBe(true);
		expect(field?.disabled).toBe(false);
		expect(field?.hint).toBe('Показаны активные счета в той же валюте (BYN)');
	});

	it('disables the field for an archived current account when no active account of the currency is left', () => {
		const field = resolveOperationAccountField({
			choices: [oldCard, usd],
			currentAccountId: 'old',
			selectedAccountId: 'old'
		});

		expect(field?.disabled).toBe(true);
	});

	it('falls back to the current account when the chosen id is not offered', () => {
		const field = resolveOperationAccountField({
			choices: [cash, usd],
			currentAccountId: 'cash',
			selectedAccountId: 'usd'
		});

		expect(field?.selected.id).toBe('cash');
	});

	it('returns nothing when the current account is unknown', () => {
		expect(resolveOperationAccountField({
			choices: [north],
			currentAccountId: 'cash',
			selectedAccountId: 'cash'
		})).toBeUndefined();
	});
});

describe('resolveMovedAccountId', () => {
	it('sends the account only when it differs from the current one', () => {
		expect(resolveMovedAccountId('cash', 'cash')).toBeUndefined();
		expect(resolveMovedAccountId('cash', 'wife')).toBe('wife');
	});
});

describe('updateOperationInputSchema', () => {
	const base = {
		amountMinor: 2_120,
		categoryId: null,
		comment: '',
		contactId: null,
		happenedOn: '2026-10-11',
		id: 'operation-1',
		title: 'Хлеб и молоко',
		type: 'expense' as const,
		version: 3
	};

	it('accepts an account id and keeps it', () => {
		expect(updateOperationInputSchema.parse({ ...base, accountId: 'wife' }).accountId).toBe('wife');
	});

	it('stays valid and carries no account without one', () => {
		const parsed = updateOperationInputSchema.parse(base);

		expect('accountId' in parsed).toBe(false);
	});
});

describe('buildOperationAccountChoices', () => {
	function account(id: string, overrides: Partial<PersistedAccount> = {}): PersistedAccount {
		return {
			archivedAt: null,
			color: '#3f77a8',
			createdAt: '2026-01-01T00:00:00.000Z',
			currency: 'BYN',
			description: '',
			details: {},
			hasOperations: true,
			id,
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: id,
			owner: '',
			type: 'cash',
			updatedAt: '2026-01-01T00:00:00.000Z',
			version: 1,
			...overrides
		} as PersistedAccount;
	}

	it('joins accounts with balances, marks archived ones and shows zero without a balance row', () => {
		const choices = buildOperationAccountChoices(
			[account('a'), account('b', { archivedAt: '2026-02-01T00:00:00.000Z' }), account('c')],
			[{ accountId: 'a', balanceMinor: 630_151, currency: 'BYN' }, { accountId: 'b', balanceMinor: 5, currency: 'BYN' }]
		);

		expect(choices.map((item) => [item.id, item.archived, item.balanceMinor])).toEqual([
			['a', false, 630_151],
			['b', true, 5],
			['c', false, 0]
		]);
	});
});

describe('formatDateKey', () => {
	it('prints a day key as DD.MM.YYYY', () => {
		expect(formatDateKey('2026-10-11')).toBe('11.10.2026');
	});
});
