import { AccentColor } from '@/shared/lib';
import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { CardFace } from './card-face';

const meta = {
	title: 'Kit/CardFace',
	component: CardFace,
	args: {
		color: AccentColor.BLUE,
		number: '•••• 1111',
		holder: 'IVAN IVANOV',
		expiry: '09/29',
		title: 'Основная карта',
		label: 'Банковская карта',
		size: 'full'
	},
	argTypes: {
		size: { control: 'inline-radio', options: ['full', 'mini'] },
		color: { control: 'color' }
	}
} satisfies Meta<typeof CardFace>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mini: Story = {
	args: { size: 'mini' }
};

export const Expired: Story = {
	args: { expired: true, expiry: '01/24' }
};

export const LightColor: Story = {
	args: { color: '#f5d76e' }
};

export const AccountColors: Story = {
	render: (args) => (
		<StoryStack>
			{AccentColor.values().map((color) => <CardFace {...args} color={color}/>)}
		</StoryStack>
	)
};
