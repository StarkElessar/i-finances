import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Progress } from './progress';

const meta = {
	title: 'Kit/Progress',
	component: Progress,
	args: { 'aria-label': 'Использовано бюджета', value: 62, tone: 'info' }
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Warning: Story = { args: { value: 91, tone: 'warning' } };

export const OverBudget: Story = { args: { value: 117, tone: 'danger', 'aria-valuetext': '117%' } };
