import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { SignedInIdentity } from './signed-in-identity';

const meta = {
	title: 'Auth/SignedInIdentity',
	component: SignedInIdentity,
	args: {
		identity: { displayName: 'Анна', telegramUsername: 'anna_k' },
		onContinue: () => {},
		onSignOut: async () => {}
	}
} satisfies Meta<typeof SignedInIdentity>;

export default meta;

type Story = StoryObj<typeof meta>;

/** «Вы вошли как Анна, @anna_k»: shown before anything else after a Telegram sign-in. */
export const Default: Story = {};

export const WithoutUsername: Story = {
	args: { identity: { displayName: 'Анна', telegramUsername: null } }
};

export const Loading: Story = {
	args: { identity: undefined, isLoading: true }
};

export const SignOutFails: Story = {
	args: {
		onSignOut: async () => {
			throw new Error('network');
		}
	}
};
