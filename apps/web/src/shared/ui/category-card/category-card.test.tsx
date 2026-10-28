// @vitest-environment jsdom
import { formatMinorUnitsCurrency } from '@/shared/lib';

import { fireEvent, screen } from '@testing-library/dom';
import { ShoppingCart } from 'lucide-solid';
import { createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { CategoryCard } from './category-card';

const CATEGORY = { name: 'Продукты', spentMinor: 25460, currency: 'BYN', tint: 'var(--color-series-1)' } as const;

describe('CategoryCard', () => {
	it('shows the warning from the caller, a percentage and an accessible progress track', () => {
		renderUi(() => <CategoryCard {...CATEGORY} icon={<ShoppingCart/>} budgetMinor={28000} budgetTone='warning'/>);

		expect(screen.getByText('91%')).toBeInTheDocument();
		expect(screen.getByRole('progressbar', { name: 'Бюджет категории Продукты' })).toHaveAttribute('aria-valuenow', '91');
		expect(screen.getByText(formatMinorUnitsCurrency(CATEGORY.spentMinor, 'BYN'), { normalizer: (text) => text })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('caps the track but keeps the actual percentage and overrun visible', () => {
		renderUi(() => <CategoryCard {...CATEGORY} icon={<ShoppingCart/>} spentMinor={23300} budgetMinor={20000}/>);

		expect(screen.getByText('117%')).toBeInTheDocument();
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
		expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '117%');
		expect(screen.getByText(/превышение/).textContent).toContain(formatMinorUnitsCurrency(3300, 'BYN'));
	});

	it.each([undefined, null, 0])('omits the badge and progress without a positive budget (%s)', (budgetMinor) => {
		renderUi(() => <CategoryCard {...CATEGORY} icon={<ShoppingCart/>} budgetMinor={budgetMinor}/>);

		expect(screen.getByText('Без бюджета')).toBeInTheDocument();
		expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
		expect(screen.queryByText(/%/)).not.toBeInTheDocument();
	});

	it('updates when spending changes and provides a named native edit button', () => {
		const [spent, setSpent] = createSignal(0);
		const onEdit = vi.fn();

		renderUi(() => <CategoryCard {...CATEGORY} icon={<ShoppingCart/>} spentMinor={spent()} budgetMinor={10000} onEdit={onEdit}/>);

		expect(screen.getByText('0%')).toBeInTheDocument();
		setSpent(5000);
		expect(screen.getByText('50%')).toBeInTheDocument();

		const edit = screen.getByRole('button', { name: 'Редактировать категорию Продукты' });

		edit.focus();
		expect(edit).toHaveFocus();
		fireEvent.click(edit);
		expect(onEdit).toHaveBeenCalledTimes(1);
	});
});
