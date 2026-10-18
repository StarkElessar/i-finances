import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Tabs, type TabsProps } from './tabs';

const SECTIONS = [
	{ value: 'overview', label: 'Обзор' },
	{ value: 'compare', label: 'Сравнение' }
];

/** Keeps the selection in a signal so that the story behaves like a real controlled control. */
function Controlled(props: Omit<TabsProps, 'onChange'>) {
	const [value, setValue] = createSignal(props.value);

	return <Tabs {...props} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/Tabs',
	component: Tabs,
	args: {
		'aria-label': 'Разделы статистики',
		options: SECTIONS,
		value: 'overview',
		onChange: () => undefined
	},
	render: (args) => <Controlled {...args}/>
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SecondSelected: Story = {
	args: { value: 'compare' }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

// Only the selected tab can hold focus (roving tabindex), so only it gets the pseudo state.
export const Focus: Story = {
	parameters: { pseudo: { focusVisible: ['[aria-selected="true"]'] } }
};

export const Disabled: Story = {
	args: {
		options: [
			{ value: 'overview', label: 'Обзор' },
			{ value: 'compare', label: 'Сравнение', disabled: true }
		]
	}
};
