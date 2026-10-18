import { StoryStack } from '@/shared/storybook';

import { Check, CircleAlert, RefreshCw } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Badge } from './badge';

const meta = {
	title: 'Kit/Badge',
	component: Badge,
	args: {
		children: 'Загружен',
		tone: 'neutral'
	},
	argTypes: {
		tone: { control: 'inline-radio', options: ['neutral', 'success', 'danger', 'warning', 'info'] }
	}
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The statuses of a receipt, as on the board. */
export const Tones: Story = {
	render: () => (
		<StoryStack>
			<Badge icon={<Check/>} tone='success'>Операции созданы</Badge>
			<Badge icon={<CircleAlert/>} tone='danger'>Ошибка обработки</Badge>
			<Badge tone='warning'>Нужна проверка</Badge>
			<Badge icon={<RefreshCw/>} tone='info'>Обрабатывается</Badge>
			<Badge>Загружен</Badge>
		</StoryStack>
	)
};

export const Percentage: Story = {
	args: { children: '62%', tone: 'info' }
};
