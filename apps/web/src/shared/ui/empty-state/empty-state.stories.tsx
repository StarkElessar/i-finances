import { Button } from '@/shared/ui/button';

import { ChartColumn, Plus, Search } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { EmptyState } from './empty-state';

const meta = {
	title: 'Kit/EmptyState',
	component: EmptyState,
	args: {
		icon: <Search/>,
		title: 'В этом периоде операций нет',
		description: 'Выберите другой период или добавьте операцию кнопкой «+».'
	}
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
	args: {
		action: <Button size='sm' startIcon={<Plus/>}>Добавить операцию</Button>
	}
};

export const WithoutAction: Story = {
	args: {
		icon: <ChartColumn/>,
		title: 'Нет трат за октябрь',
		description: 'Как только появятся операции, здесь будут категории и динамика.'
	}
};

export const TitleOnly: Story = {
	args: { description: undefined }
};
