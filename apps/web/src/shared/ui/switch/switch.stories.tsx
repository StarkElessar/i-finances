import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Switch } from './switch';

const meta = {
	title: 'Kit/Switch',
	component: Switch,
	args: {
		'aria-label': 'Уведомления'
	}
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
	args: { checked: true }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

export const Disabled: Story = {
	render: (args) => (
		<StoryStack>
			<Switch {...args} disabled/>
			<Switch {...args} checked disabled/>
		</StoryStack>
	)
};
