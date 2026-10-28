// @vitest-environment jsdom
import css from './bottom-navigation.module.scss';

import { createMemoryHistory, MemoryRouter, Route } from '@solidjs/router';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { ChartColumn, House, Receipt, Tag, Users } from 'lucide-solid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from '../../../../tests/render-ui';

import { BottomNavigation, type BottomNavigationProps } from './bottom-navigation';

const ITEMS: BottomNavigationProps['items'] = [
	{ href: '/', label: 'Главная', icon: House },
	{ href: '/receipts', label: 'Чеки', icon: Receipt },
	{ href: '/categories', label: 'Категории', icon: Tag },
	{ href: '/contacts', label: 'Контакты', icon: Users },
	{ href: '/stats', label: 'Статистика', icon: ChartColumn }
];

function mount(path = '/') {
	const history = createMemoryHistory();

	history.set({ value: path, replace: true, scroll: false });

	const host = renderUi(() => (
		<MemoryRouter history={history} root={() => <BottomNavigation items={ITEMS}/>}>
			<Route path='*' component={() => null}/>
		</MemoryRouter>
	));

	return { history, host };
}

describe('BottomNavigation', () => {
	beforeEach(() => {
		vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
	});

	afterEach(() => vi.restoreAllMocks());

	it('portals five named links and marks exactly the current route', () => {
		const { host } = mount('/categories');
		const nav = screen.getByRole('navigation', { name: 'Основная навигация' });

		expect(host).not.toContainElement(nav);
		expect(within(nav).getAllByRole('link')).toHaveLength(5);
		expect(within(nav).getByRole('link', { current: 'page' })).toHaveAccessibleName('Категории');
		expect(within(nav).getAllByRole('link', { current: 'page' })).toHaveLength(1);
		for (const item of ITEMS) {
			expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
		}
	});

	it('navigates using the existing router and exact route matching', async () => {
		const { history } = mount();

		fireEvent.click(screen.getByRole('link', { name: 'Контакты' }));
		await waitFor(() => expect(history.get()).toBe('/contacts'));
		expect(screen.getByRole('link', { current: 'page' })).toHaveAccessibleName('Контакты');
		history.set({ value: '/contacts/one', scroll: false });
		await waitFor(() => expect(screen.queryByRole('link', { current: 'page' })).not.toBeInTheDocument());
	});

	it('hides for a focused text field and restores itself when the field leaves the DOM', async () => {
		const { host } = mount();
		const nav = screen.getByRole('navigation');
		const input = document.createElement('input');

		host.append(input);
		input.focus();
		expect(nav).toHaveClass(css.hidden);
		input.remove();
		await waitFor(() => expect(nav).not.toHaveClass(css.hidden));
	});

	it('keeps current links keyboard focusable and ignores checkbox focus', () => {
		const { host } = mount();
		const link = screen.getByRole('link', { current: 'page' });
		const checkbox = document.createElement('input');

		link.focus();
		expect(link).toHaveFocus();
		checkbox.type = 'checkbox';
		host.append(checkbox);
		checkbox.focus();
		expect(screen.getByRole('navigation')).not.toHaveClass(css.hidden);
	});
});
