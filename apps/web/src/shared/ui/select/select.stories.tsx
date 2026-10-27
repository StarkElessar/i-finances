import { StoryStack } from '@/shared/storybook';

import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Select, type SelectProps } from './select';

const OPTIONS = [
	{ value: 'date', label: 'По дате' },
	{ value: 'amount', label: 'По сумме (BYN)' },
	{ value: 'account', label: 'По счёту' }
];

function Controlled(props: SelectProps) {
	const [value, setValue] = createSignal(props.value);

	return <Select {...props} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/Select',
	component: Select,
	args: { label: 'Сортировка', options: OPTIONS, value: 'date' },
	argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
	render: (args) => <Controlled {...args}/>
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hover: Story = { parameters: { pseudo: { hover: ['select'] } } };

export const Focus: Story = { parameters: { pseudo: { focus: ['select'] } } };

// Open with a tap, click or keyboard: the native menu cannot be captured by CSS pseudo states.
export const NativeOpen: Story = {
	args: { hint: 'Список рисует браузер или ОС. Только текст, валюта кодом (BYN), без иконок.' }
};

export const Disabled: Story = { args: { disabled: true } };

export const Touch: Story = {
	render: (args) => <StoryStack touch><Controlled {...args}/></StoryStack>
};

export const Error: Story = {
	args: {
		label: 'Счёт',
		value: '',
		required: true,
		error: 'Выберите счёт',
		options: [{ value: '', label: 'Выберите счёт', disabled: true }, { value: 'cash', label: 'Наличные (BYN)' }]
	}
};

export const Sizes: Story = {
	render: (args) => (
		<StoryStack column>
			<Controlled {...args} label='Компактный · 32, на тач 44' size='sm'/>
			<Controlled {...args} label='Обычный · 40, на тач 44' size='md'/>
			<Controlled {...args} label='Крупный · 48' size='lg'/>
		</StoryStack>
	)
};
