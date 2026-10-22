import { Banner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { Typography } from '@/shared/ui/typography';

import { CircleCheck } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { PageCard } from './page-card';

const meta = {
	title: 'Kit/PageCard',
	component: PageCard,
	args: {
		children: null
	},
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof PageCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** A card with a title, a banner and a button, as the success of an accepted invitation on `Flow-Invite`. */
export const Default: Story = {
	render: () => (
		<PageCard>
			<Banner icon={<CircleCheck/>} role='status' title='Готово.' tone='success'>Вы в окружении «Семья».</Banner>
			<Typography as='h2' variant='heading-2'>Добро пожаловать, Анна</Typography>
			<Button fullWidth size='lg'>Открыть главную</Button>
		</PageCard>
	)
};
