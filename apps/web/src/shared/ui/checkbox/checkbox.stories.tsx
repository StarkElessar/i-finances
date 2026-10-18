import { StoryStack } from '@/shared/storybook';

import { createSignal } from 'solid-js';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Checkbox } from './checkbox';

const meta = {
	title: 'Kit/Checkbox',
	component: Checkbox,
	args: {
		children: 'Учитывать в «Всего по семье»'
	}
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
	args: { checked: true }
};

/** Toggles by click on the box or on the label, and by Space. */
export const Interactive: Story = {
	render: (args) => {
		const [checked, setChecked] = createSignal(false);

		return <Checkbox {...args} checked={checked()} onChange={(event) => setChecked(event.currentTarget.checked)}/>;
	}
};

export const WithoutLabel: Story = {
	args: { 'aria-label': 'Выбрать операцию', children: undefined }
};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

export const Disabled: Story = {
	render: (args) => (
		<StoryStack column>
			<Checkbox {...args} disabled/>
			<Checkbox {...args} checked disabled/>
		</StoryStack>
	)
};
