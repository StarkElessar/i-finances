import { StoryStack } from '@/shared/storybook';

import { Send } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ButtonLink } from './button-link';

const meta = {
	title: 'Kit/ButtonLink',
	component: ButtonLink,
	args: {
		children: 'Войти через Telegram',
		href: 'https://t.me/i_finances_bot?start=example',
		rel: 'noopener noreferrer',
		size: 'lg',
		target: '_blank',
		variant: 'primary'
	},
	argTypes: {
		variant: { control: 'inline-radio', options: ['primary', 'secondary', 'ghost', 'danger'] },
		size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] }
	}
} satisfies Meta<typeof ButtonLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: (args) => <ButtonLink {...args} startIcon={<Send/>}/>
};

export const Variants: Story = {
	render: (args) => (
		<StoryStack>
			<ButtonLink {...args} startIcon={<Send/>}>Войти через Telegram</ButtonLink>
			<ButtonLink {...args} variant='secondary'>Открыть Telegram</ButtonLink>
			<ButtonLink {...args} variant='ghost'>Ссылка</ButtonLink>
		</StoryStack>
	)
};

export const FullWidth: Story = {
	args: { fullWidth: true },
	render: (args) => <ButtonLink {...args} startIcon={<Send/>}/>
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } },
	render: (args) => <ButtonLink {...args} startIcon={<Send/>}/>
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } },
	render: (args) => <ButtonLink {...args} startIcon={<Send/>}/>
};
