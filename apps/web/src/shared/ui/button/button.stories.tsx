import { StoryStack } from '@/shared/storybook';

import { Plus, Trash } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Button } from './button';

const meta = {
	title: 'Kit/Button',
	component: Button,
	args: {
		children: 'Сохранить',
		variant: 'primary',
		size: 'md'
	},
	argTypes: {
		variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
		size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] }
	}
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Secondary: Story = {
	args: { variant: 'secondary' }
};

export const Ghost: Story = {
	args: { variant: 'ghost' }
};

export const Danger: Story = {
	args: { variant: 'danger', children: 'Удалить' }
};

export const Sizes: Story = {
	render: (args) => (
		<StoryStack>
			<Button {...args} size='sm'>Малая</Button>
			<Button {...args} size='md'>Средняя</Button>
			<Button {...args} size='lg'>Большая</Button>
		</StoryStack>
	)
};

export const WithIcons: Story = {
	args: {
		children: 'Добавить операцию'
	},
	render: (args) => <Button {...args} startIcon={<Plus/>}/>
};

export const IconOnly: Story = {
	args: {
		'aria-label': 'Удалить',
		iconOnly: true,
		variant: 'secondary'
	},
	render: (args) => (
		<Button {...args}>
			<Trash/>
		</Button>
	)
};

export const FullWidth: Story = {
	args: { fullWidth: true }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

export const Disabled: Story = {
	args: { disabled: true }
};

export const Loading: Story = {
	args: { loading: true }
};
