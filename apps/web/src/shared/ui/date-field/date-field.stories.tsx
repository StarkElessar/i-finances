import { StoryStack } from '@/shared/storybook';

import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { DateField, type DateFieldProps } from './date-field';

function Controlled(props: DateFieldProps) {
	const [value, setValue] = createSignal(props.value);

	return <DateField {...props} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/DateField',
	component: DateField,
	args: { label: 'Дата', value: '2026-10-18', required: true },
	argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
	render: (args) => <Controlled {...args}/>
} satisfies Meta<typeof DateField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hover: Story = { parameters: { pseudo: { hover: ['input'] } } };

export const Focus: Story = { parameters: { pseudo: { focus: ['input'] } } };

// The OS draws the open picker, including the wheel on iOS. Activate the native calendar to inspect it.
export const NativePicker: Story = {
	args: { hint: 'Пикер рисует система. Вид даты зависит от языка браузера; значение — YYYY-MM-DD.' }
};

export const Disabled: Story = { args: { disabled: true } };

export const Touch: Story = {
	render: (args) => <StoryStack touch><Controlled {...args}/></StoryStack>
};

export const Error: Story = { args: { value: '', error: 'Выберите дату' } };

export const MinMax: Story = {
	args: { min: '2026-10-01', max: '2026-10-31', hint: 'Дата с 1 по 31 октября 2026' }
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
