import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { AppLogo } from './app-logo';

const meta = {
	title: 'Kit/AppLogo',
	component: AppLogo
} satisfies Meta<typeof AppLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
