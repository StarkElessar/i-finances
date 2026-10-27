import { TextField } from '@/shared/ui/text-field';

import { createMemoryHistory, MemoryRouter, Route } from '@solidjs/router';
import { ChartColumn, House, Receipt, Tag, Users } from 'lucide-solid';
import { onMount, Show } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { BottomNavigation, type BottomNavigationProps } from './bottom-navigation';

const ITEMS: BottomNavigationProps['items'] = [
	{ href: '/', label: 'Главная', icon: House },
	{ href: '/receipts', label: 'Чеки', icon: Receipt },
	{ href: '/categories', label: 'Категории', icon: Tag },
	{ href: '/contacts', label: 'Контакты', icon: Users },
	{ href: '/stats', label: 'Статистика', icon: ChartColumn }
];

function Preview(props: BottomNavigationProps & { initialPath?: string; keyboard?: boolean }) {
	const history = createMemoryHistory();
	let input: HTMLInputElement | undefined;

	history.set({ value: props.initialPath ?? '/', replace: true, scroll: false });

	onMount(() => {
		if (props.keyboard) {
			input?.focus();
		}
	});

	return (
		<MemoryRouter
			history={history}
			root={() => (
				<>
					<Show when={props.keyboard}>
						<TextField ref={input} label='Поиск' hint='Навигация скрыта, пока поле в фокусе'/>
					</Show>
					<BottomNavigation items={props.items}/>
				</>
			)}
		>
			<Route path='*' component={() => null}/>
		</MemoryRouter>
	);
}

const meta = {
	title: 'Kit/BottomNavigation',
	component: Preview,
	args: { items: ITEMS },
	globals: { viewport: { value: 'phone', isRotated: false } }
} satisfies Meta<typeof Preview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Categories: Story = { args: { initialPath: '/categories' } };

export const Contacts: Story = { args: { initialPath: '/contacts' } };

export const Statistics: Story = { args: { initialPath: '/stats' } };

export const Hover: Story = { parameters: { pseudo: { hover: ['a'] } } };

export const Focus: Story = { parameters: { pseudo: { focusVisible: ['a:not([aria-current])'] } } };

export const CurrentFocus: Story = { parameters: { pseudo: { focusVisible: ['a[aria-current]'] } } };

export const KeyboardHidden: Story = { args: { keyboard: true } };
