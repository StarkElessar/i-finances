import { StoryStack } from '@/shared/storybook';

import { Archive, Tag } from 'lucide-solid';
import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Segmented, type SegmentedProps } from './segmented';

const PERIODS = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: 'year', label: 'Год' }
];

/** Keeps the selection in a signal so that the story behaves like a real controlled control. */
function Controlled(props: Omit<SegmentedProps, 'onChange'>) {
	const [value, setValue] = createSignal(props.value);

	return <Segmented {...props} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/Segmented',
	component: Segmented,
	args: {
		'aria-label': 'Период',
		options: PERIODS,
		value: 'month',
		onChange: () => undefined
	},
	render: (args) => <Controlled {...args}/>
} satisfies Meta<typeof Segmented>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// The icons (JSX nodes) are created in `render`, not in module-level `args`: Solid would create
// them outside a root and reuse one node across renders.
export const WithIconsAndCounts: Story = {
	args: {
		'aria-label': 'Состояние',
		value: 'active'
	},
	render: (args) => (
		<Controlled
			{...args}
			options={[
				{ value: 'active', label: 'Активные', icon: <Tag/>, count: 43 },
				{ value: 'archive', label: 'Архив', icon: <Archive/>, count: 2 }
			]}
		/>
	)
};

export const FullWidth: Story = {
	args: {
		'aria-label': 'Тип операции',
		fullWidth: true,
		options: [
			{ value: 'expense', label: 'Расход' },
			{ value: 'income', label: 'Приход' }
		],
		value: 'expense'
	}
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

export const Disabled: Story = {
	render: (args) => (
		<StoryStack column>
			<Controlled
				{...args}
				options={[
					{ value: 'week', label: 'Неделя' },
					{ value: 'month', label: 'Месяц' },
					{ value: 'year', label: 'Год', disabled: true }
				]}
			/>
			<Controlled {...args} options={PERIODS.map((option) => ({ ...option, disabled: true }))}/>
		</StoryStack>
	)
};
