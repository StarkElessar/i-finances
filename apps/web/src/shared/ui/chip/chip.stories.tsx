import { StoryStack } from '@/shared/storybook';

import { Plus } from 'lucide-solid';
import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Chip } from './chip';

const meta = {
	title: 'Kit/Chip',
	component: Chip,
	args: {
		children: '3 мес',
		selected: false
	}
} satisfies Meta<typeof Chip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = {
	args: { selected: true }
};

export const WithDot: Story = {
	args: { children: 'Продукты', color: 'var(--color-series-1)' }
};

/** A selected chip with the × and a plain one with the series colour. */
export const Removable: Story = {
	render: () => (
		<StoryStack>
			<Chip color='var(--color-series-1)' removable selected>Продукты</Chip>
			<Chip color='var(--color-series-2)' removable selected>Фастфуд</Chip>
			<Chip color='var(--color-series-5)'>Транспорт</Chip>
		</StoryStack>
	)
};

export const WithIcon: Story = {
	render: (args) => <Chip {...args} icon={<Plus/>}>Категория</Chip>
};

/** The filter row of the comparison tab: toggles work on click, Space and Enter. */
export const Interactive: Story = {
	render: () => {
		const [selected, setSelected] = createSignal(new Set(['Продукты', '3 мес']));
		const toggle = (name: string) => setSelected((current) => {
			const next = new Set(current);

			if (!next.delete(name)) {
				next.add(name);
			}

			return next;
		});

		return (
			<StoryStack>
				<Chip color='var(--color-series-1)' removable selected={selected().has('Продукты')} onClick={() => toggle('Продукты')}>
					Продукты
				</Chip>
				<Chip color='var(--color-series-5)' removable selected={selected().has('Транспорт')} onClick={() => toggle('Транспорт')}>
					Транспорт
				</Chip>
				<Chip selected={selected().has('3 мес')} onClick={() => toggle('3 мес')}>3 мес</Chip>
				<Chip selected={selected().has('12 мес')} onClick={() => toggle('12 мес')}>12 мес</Chip>
			</StoryStack>
		);
	}
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

/** A selected chip is a tab stop as well: it shows the same ring. */
export const FocusSelected: Story = {
	args: { selected: true },
	parameters: { pseudo: { focusVisible: true } }
};

/** Hover on a selected removable chip: a click removes it, so it reacts. */
export const HoverRemovable: Story = {
	args: { color: 'var(--color-series-1)', removable: true, selected: true },
	parameters: { pseudo: { hover: true } }
};

export const Disabled: Story = {
	render: (args) => (
		<StoryStack>
			<Chip {...args} disabled>Не выбран</Chip>
			<Chip {...args} disabled selected>Выбран</Chip>
		</StoryStack>
	)
};
