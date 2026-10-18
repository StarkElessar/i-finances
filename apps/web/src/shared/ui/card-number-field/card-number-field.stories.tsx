import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { CardNumberFieldProps } from './card-number-field';
import { CardNumberField } from './card-number-field';

// The field is controlled, so every story keeps the displayed value in a local signal.
function renderControlled(args: CardNumberFieldProps) {
	const [value, setValue] = createSignal(args.value);

	return <CardNumberField {...args} value={value()} onValueChange={setValue}/>;
}

const meta = {
	title: 'Kit/CardNumberField',
	component: CardNumberField,
	args: {
		value: '',
		onValueChange: fn()
	},
	render: renderControlled
} satisfies Meta<typeof CardNumberField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
	args: { value: '4111 1111 1111 1111' }
};

export const Optional: Story = {
	args: { optional: true }
};

export const Focus: Story = {
	parameters: { pseudo: { focusWithin: true } }
};

export const WithError: Story = {
	args: { error: 'Номер карты должен содержать 16 цифр', value: '4111 1111' }
};

export const Disabled: Story = {
	args: { disabled: true, value: '4111 1111 1111 1111' }
};
