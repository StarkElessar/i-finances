import { AccentColor } from '@/shared/lib';

import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { ColorPickerProps } from './color-picker';
import { ColorPicker } from './color-picker';

// The picker is controlled, so every story keeps the selected colour in a local signal.
function renderControlled(args: ColorPickerProps) {
	const [value, setValue] = createSignal(args.value);

	return <ColorPicker {...args} value={value()} onChange={setValue}/>;
}

const meta = {
	title: 'Kit/ColorPicker',
	component: ColorPicker,
	args: {
		label: 'Цвет счёта',
		value: AccentColor.BLUE,
		onChange: fn()
	},
	render: renderControlled
} satisfies Meta<typeof ColorPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomColor: Story = {
	args: { value: '#e91e63' }
};

export const CustomOptions: Story = {
	args: {
		value: '#0f766e',
		options: [
			{ label: 'Бирюзовый', value: '#0f766e' },
			{ label: 'Сланцевый', value: '#475569' },
			{ label: 'Оранжевый', value: '#c2410c' }
		]
	}
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};
