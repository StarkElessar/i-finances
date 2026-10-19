import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { AppLogo } from './app-logo';

const meta = {
	title: 'Kit/AppLogo',
	component: AppLogo,
	argTypes: {
		size: { control: 'inline-radio', options: ['md', 'lg'] }
	}
} satisfies Meta<typeof AppLogo>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The sign-in panel (`M-SignIn`, `D-SignIn`). */
export const Large: Story = {
	args: { size: 'lg' }
};
