import { Plus } from 'lucide-solid';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { Fab } from './fab';

// The FAB exists only below `sm` (the toolbar "+" takes over), so the stories open in the phone viewport.
const meta = {
	title: 'Kit/Fab',
	component: Fab,
	args: {
		'aria-label': 'Новая операция'
	},
	globals: {
		viewport: { value: 'phone', isRotated: false }
	},
	render: (args) => (
		<Fab {...args}>
			<Plus/>
		</Fab>
	)
} satisfies Meta<typeof Fab>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hover: Story = {
	parameters: { pseudo: { hover: true } }
};

export const Focus: Story = {
	parameters: { pseudo: { focusVisible: true } }
};

/** Disabled looks like a disabled Primary button: a grey disc, no shadow. */
export const Disabled: Story = {
	args: { disabled: true }
};
