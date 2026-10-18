import type { PhoneCountryCode } from '@/shared/lib';

import { createSignal } from 'solid-js';
import { fn } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { PhoneFieldProps } from './phone-field';
import { PhoneField } from './phone-field';

// The field is controlled, so every story keeps country and value in local signals.
function renderControlled(args: PhoneFieldProps) {
	const [countryCode, setCountryCode] = createSignal<PhoneCountryCode>(args.countryCode);
	const [value, setValue] = createSignal(args.value);

	return (
		<PhoneField
			{...args}
			countryCode={countryCode()}
			value={value()}
			onCountryCodeChange={setCountryCode}
			onValueChange={setValue}
		/>
	);
}

const meta = {
	title: 'Kit/PhoneField',
	component: PhoneField,
	args: {
		countryCode: 'by',
		onCountryCodeChange: fn(),
		onValueChange: fn(),
		value: ''
	},
	render: renderControlled
} satisfies Meta<typeof PhoneField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
	args: { value: '(29) 123-45-67' }
};

export const Russia: Story = {
	args: { countryCode: 'ru', value: '(912) 345-67-89' }
};

export const Optional: Story = {
	args: { optional: true }
};

export const Focus: Story = {
	parameters: { pseudo: { focusWithin: true } }
};

export const WithError: Story = {
	args: { error: 'Введите телефон полностью', value: '(29) 12' }
};

export const Disabled: Story = {
	args: { disabled: true, value: '(29) 123-45-67' }
};
