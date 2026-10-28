import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { FlatCard } from './flat-card';

const meta = {
	title: 'Kit/FlatCard',
	component: FlatCard,
	args: {
		children: 'Вы один · нет счетов, операций, переводов, чеков, контактов и категорий',
		title: 'Дом'
	}
} satisfies Meta<typeof FlatCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = {
	args: { children: undefined }
};

export const Outlined: Story = {
	args: { variant: 'outlined' }
};
