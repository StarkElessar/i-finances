import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { KpiCard } from './kpi-card';

const meta = {
	title: 'Kit/KpiCard',
	component: KpiCard,
	args: { label: 'За период', amountMinor: 1048700, currency: 'BYN', description: '10 мес' }
} satisfies Meta<typeof KpiCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Decrease: Story = {
	render: () => <KpiCard description='сентябрь против августа' label='Последний закрытый' tone='success' value='−43%'/>
};
