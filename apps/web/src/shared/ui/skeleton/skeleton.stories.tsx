import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Skeleton } from './skeleton';

const meta = {
	title: 'Kit/Skeleton',
	component: Skeleton,
	args: {
		inlineSize: '60%'
	}
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A list row as the «Безопасность» list loads it: the icon tile and two lines of text. */
export const Row: Story = {
	render: () => (
		<StoryStack column>
			<Skeleton inlineSize='45%'/>
			<Skeleton inlineSize='75%'/>
			<Skeleton tile/>
		</StoryStack>
	)
};
