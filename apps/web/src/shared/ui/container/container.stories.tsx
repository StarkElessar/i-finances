import { Typography } from '@/shared/ui/typography';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Container } from './index';

const meta = {
	title: 'Kit/Container',
	component: Container,
	args: {
		children: <Typography>Содержимое страницы центрируется и получает боковые отступы.</Typography>
	},
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Container>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MaxSize: Story = {
	args: { useMaxSize: true }
};
