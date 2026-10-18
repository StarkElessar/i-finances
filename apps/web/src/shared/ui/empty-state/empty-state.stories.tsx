import { Button } from '@/shared/ui/button';

import { ChartColumn, Plus, Search } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { EmptyState } from './empty-state';

// The icon (a JSX node) is created in `render`, not in module-level `args`: Solid would create it
// outside a root and reuse one node across renders. `icon: null` only satisfies the required prop.
const meta = {
	title: 'Kit/EmptyState',
	component: EmptyState,
	args: {
		icon: null,
		title: 'В этом периоде операций нет',
		description: 'Выберите другой период или добавьте операцию кнопкой «+».'
	},
	render: (args) => <EmptyState {...args} icon={<Search/>}/>
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
	render: (args) => (
		<EmptyState
			{...args}
			action={<Button size='sm' startIcon={<Plus/>}>Добавить операцию</Button>}
			icon={<Search/>}
		/>
	)
};

export const WithoutAction: Story = {
	args: {
		title: 'Нет трат за октябрь',
		description: 'Как только появятся операции, здесь будут категории и динамика.'
	},
	render: (args) => <EmptyState {...args} icon={<ChartColumn/>}/>
};

export const TitleOnly: Story = {
	args: { description: undefined }
};
