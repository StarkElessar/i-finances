import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Avatar } from './avatar';

const meta = {
	title: 'Kit/Avatar',
	component: Avatar,
	args: {
		initials: 'АН',
		size: 'md'
	},
	argTypes: {
		size: { control: 'inline-radio', options: ['md', 'lg'] }
	}
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
	render: () => (
		<StoryStack>
			<Avatar initials='АЛ' size='md'/>
			<Avatar initials='АЛ' size='lg'/>
		</StoryStack>
	)
};
