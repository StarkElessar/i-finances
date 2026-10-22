import { userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { createFakeSecurityClient, STORY_SESSIONS } from './security-story-fixtures';
import { SessionsSection } from './sessions-section';

const meta = {
	title: 'Security/SessionsSection',
	component: SessionsSection,
	args: {
		client: createFakeSecurityClient()
	}
} satisfies Meta<typeof SessionsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** `M-Security`, `D-Security`: «Этот сеанс» without a button, «Завершить» for the others. */
export const Default: Story = {};

export const Loading: Story = {
	args: { client: createFakeSecurityClient({ loading: true }) }
};

/** `D-Security`, «Пусто»: only this session is left. */
export const OnlyThisSession: Story = {
	args: { client: createFakeSecurityClient({ sessions: STORY_SESSIONS.slice(0, 1) }) }
};

export const LoadFailed: Story = {
	args: { client: createFakeSecurityClient({ failLists: true }) }
};

/** `D-Security`, «Завершить все остальные: подтверждение». */
export const ConfirmEndAll: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Завершить все остальные' }));
	}
};

/** After ending the others: the count is told and the list shrinks to this session. */
export const EndedAll: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(await canvas.findByRole('button', { name: 'Завершить все остальные' }));
		await userEvent.click(await canvas.findByRole('button', { name: /^Завершить$/ }));
	}
};
