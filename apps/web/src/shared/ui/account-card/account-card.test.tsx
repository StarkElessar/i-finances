// @vitest-environment jsdom
import { formatMinorUnitsCurrency } from '@/shared/lib';

import { fireEvent, screen } from '@testing-library/dom';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { AccountCard } from './account-card';

const ACCOUNT = { name: 'Карта', type: 'card', balanceMinor: 94524, currency: 'USD', tint: 'var(--color-series-5)' } as const;

describe('AccountCard', () => {
	it('exposes selection and reacts to controlled changes without repeating an active action', () => {
		const [selected, setSelected] = createSignal(false);
		const onSelect = vi.fn(() => setSelected(true));

		renderUi(() => <AccountCard {...ACCOUNT} selected={selected()} onSelect={onSelect}/>);

		const button = screen.getByRole('button', { pressed: false });

		expect(button).toHaveAccessibleName(new RegExp(ACCOUNT.name));
		button.focus();
		expect(button).toHaveFocus();
		fireEvent.click(button);
		expect(button).toHaveAttribute('aria-pressed', 'true');
		fireEvent.click(button);
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('shows only the number suffix and the expired state, with the existing money formatter', () => {
		renderUi(() => <AccountCard {...ACCOUNT} cardLast4='0042' expired holder='Жена' onSelect={() => undefined}/>);

		expect(screen.getByText(/•••• 0042/)).toBeInTheDocument();
		expect(screen.getByText('истёк')).toBeInTheDocument();
		expect(screen.getByText('Жена')).toBeInTheDocument();
		expect(screen.getByText(formatMinorUnitsCurrency(94524, 'USD'), { normalizer: (text) => text })).toBeInTheDocument();
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it('does not add card details to cash accounts', () => {
		renderUi(() => <AccountCard {...ACCOUNT} type='cash' expired cardLast4='0042' onSelect={() => undefined}/>);

		expect(screen.getByText('Наличные')).toBeInTheDocument();
		expect(screen.queryByText('истёк')).not.toBeInTheDocument();
		expect(screen.queryByText(/0042/)).not.toBeInTheDocument();
	});
});
