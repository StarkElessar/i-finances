import { StoryStack } from '@/shared/storybook';

import { Search } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { TextField } from './text-field';

const meta = {
	title: 'Kit/TextField',
	component: TextField,
	args: {
		label: 'Название',
		placeholder: 'Например, «Зарплата»'
	},
	argTypes: {
		size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
		variant: { control: 'inline-radio', options: ['outline', 'filled'] }
	}
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
	args: { hint: 'Показывается в списке операций' }
};

export const Required: Story = {
	args: { required: true }
};

export const Optional: Story = {
	args: { optional: true }
};

export const Filled: Story = {
	args: { variant: 'filled' }
};

export const Sizes: Story = {
	render: (args) => (
		<StoryStack column>
			<TextField {...args} label='Малое поле' size='sm'/>
			<TextField {...args} label='Среднее поле' size='md'/>
			<TextField {...args} label='Большое поле' size='lg'/>
		</StoryStack>
	)
};

export const WithAdornment: Story = {
	args: {
		label: 'Поиск',
		placeholder: 'Найти операцию',
		startContent: <Search size={16}/>
	}
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusWithin: true } }
};

export const WithError: Story = {
	args: { error: 'Введите название', value: '' }
};

export const Disabled: Story = {
	args: { disabled: true, value: 'Нельзя изменить' }
};

export const ReadOnly: Story = {
	args: { readOnly: true, value: 'Только для чтения' }
};
