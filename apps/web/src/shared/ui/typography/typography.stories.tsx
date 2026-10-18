import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { TypographyTone, TypographyVariant } from './typography';
import { Typography } from './typography';

const VARIANTS: readonly TypographyVariant[] = [
	'display',
	'heading-1',
	'heading-2',
	'heading-3',
	'body-lg',
	'body-md',
	'body-sm',
	'label',
	'caption'
];

const TONES: readonly TypographyTone[] = ['primary', 'secondary', 'tertiary', 'danger', 'success'];

const meta = {
	title: 'Kit/Typography',
	component: Typography,
	args: {
		children: 'Баланс за октябрь 12 480,50',
		variant: 'body-md',
		tone: 'primary'
	},
	argTypes: {
		variant: { control: 'select', options: VARIANTS },
		tone: { control: 'select', options: [...TONES, 'inherit'] },
		weight: { control: 'inline-radio', options: ['regular', 'medium', 'semibold', 'bold'] },
		align: { control: 'inline-radio', options: ['start', 'center', 'end'] }
	}
} satisfies Meta<typeof Typography>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Scale: Story = {
	render: (args) => (
		<StoryStack column>
			{VARIANTS.map((variant) => (
				<Typography {...args} variant={variant}>{variant}: Баланс за октябрь 12 480,50</Typography>
			))}
		</StoryStack>
	)
};

export const Tones: Story = {
	render: (args) => (
		<StoryStack column>
			{TONES.map((tone) => (
				<Typography {...args} tone={tone}>{tone}: подпись к сумме</Typography>
			))}
		</StoryStack>
	)
};

export const Truncated: Story = {
	args: {
		children: 'Очень длинное название категории, которое не помещается в одну строку и обрезается многоточием',
		truncate: true
	}
};
