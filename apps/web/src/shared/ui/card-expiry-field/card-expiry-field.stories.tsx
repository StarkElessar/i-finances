import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { CardExpiryFieldProps } from './card-expiry-field';
import { CardExpiryField } from './card-expiry-field';

// The field is controlled, so every story keeps the displayed value in a local signal.
function renderControlled(args: CardExpiryFieldProps) {
	const [value, setValue] = createSignal(args.value);

	return <CardExpiryField {...args} value={value()} onValueChange={setValue}/>;
}

const meta = {
	title: 'Kit/CardExpiryField',
	component: CardExpiryField,
	args: {
		value: '',
		onValueChange: fn()
	},
	render: renderControlled
} satisfies Meta<typeof CardExpiryField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
	args: { value: '09/29' }
};

export const WithHint: Story = {
	args: { hint: 'Месяц и год, две цифры' }
};

export const Focus: Story = {
	parameters: { pseudo: { focusWithin: true } }
};

export const WithError: Story = {
	args: { error: 'Проверьте срок действия', value: '13/29' }
};

export const Disabled: Story = {
	args: { disabled: true, value: '09/29' }
};
