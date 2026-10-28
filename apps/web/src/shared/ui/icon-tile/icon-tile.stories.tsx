import { StoryStack } from '@/shared/storybook';

import { Clock, Link } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { IconTile } from './icon-tile';

// The icon (a JSX node) is created in `render`, not in module-level `args`.
const meta = {
	title: 'Kit/IconTile',
	component: IconTile,
	args: {
		children: null,
		tone: 'primary'
	},
	argTypes: {
		tone: { control: 'inline-radio', options: ['primary', 'neutral'] }
	},
	render: (args) => <IconTile {...args}><Link/></IconTile>
} satisfies Meta<typeof IconTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
	render: () => (
		<StoryStack>
			<IconTile tone='primary'><Link/></IconTile>
			<IconTile tone='neutral'><Clock/></IconTile>
		</StoryStack>
	)
};

export const CategoryTint: Story = {
	args: { tint: 'var(--color-series-6)' }
};
