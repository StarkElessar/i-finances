import { Typography } from '@/shared/ui/typography';

import type { ComponentProps } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Container } from './index';

// The sample content is JSX, so it is built inside render rather than kept in module-level args.
type ContainerStoryArgs = Omit<ComponentProps<typeof Container>, 'children'>;

const meta = {
	title: 'Kit/Container',
	args: { useMaxSize: false },
	parameters: { layout: 'fullscreen' },
	render: (args) => (
		<Container {...args}>
			<Typography>Содержимое страницы центрируется и получает боковые отступы.</Typography>
		</Container>
	)
} satisfies Meta<ContainerStoryArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MaxSize: Story = {
	args: { useMaxSize: true }
};
