import { ACCOUNT_TYPES } from '@/shared/lib';
import { StoryStack } from '@/shared/storybook';

import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { AccountIcon } from './account-icon';

const meta = {
	title: 'Kit/AccountIcon',
	component: AccountIcon,
	args: {
		accountType: 'card'
	},
	argTypes: {
		accountType: { control: 'select', options: ACCOUNT_TYPES }
	}
} satisfies Meta<typeof AccountIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTypes: Story = {
	render: (args) => (
		<StoryStack>
			{ACCOUNT_TYPES.map((accountType) => <AccountIcon {...args} accountType={accountType}/>)}
		</StoryStack>
	)
};
