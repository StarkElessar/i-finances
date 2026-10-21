import { StoryStack } from '@/shared/storybook';

import { CircleAlert, CircleCheck, Clock, Send } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Banner } from './banner';

const meta = {
	title: 'Kit/Banner',
	component: Banner,
	args: {
		children: 'Откройте бота и нажмите «Войти». Заявка действует 10 минут.',
		tone: 'info'
	},
	argTypes: {
		tone: { control: 'inline-radio', options: ['neutral', 'info', 'success', 'warning', 'danger'] }
	}
} satisfies Meta<typeof Banner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => <Banner {...args} icon={<Send/>}/>
};

export const WithTitle: Story = {
	args: {
		children: 'Прошло больше 10 минут. Начните вход заново.',
		title: 'Ссылка устарела.',
		tone: 'warning'
	},
	render: (args) => <Banner {...args} icon={<Clock/>}/>
};

/** All tones of the mockup `.i-banner`, as on the `Auth-Telegram` board. */
export const Tones: Story = {
	render: () => (
		<StoryStack column>
			<Banner>Без оттенка: справка внутри формы.</Banner>
			<Banner icon={<Send/>} tone='info'>Откройте бота и нажмите «Войти». Заявка действует 10 минут.</Banner>
			<Banner icon={<CircleCheck/>} title='Вы вошли как Анна,' tone='success'>@anna_k</Banner>
			<Banner icon={<Clock/>} title='Ссылка устарела.' tone='warning'>Прошло больше 10 минут. Начните вход заново.</Banner>
			<Banner icon={<CircleAlert/>} title='Вход начат в другом браузере.' tone='danger'>
				Откройте i-finances там, где нажали «Войти через Telegram», или начните заново.
			</Banner>
		</StoryStack>
	)
};
