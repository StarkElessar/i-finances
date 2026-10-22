import { userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { PasskeysSection } from './passkeys-section';
import { createFakeSecurityClient, STORY_PASSKEYS } from './security-story-fixtures';

const meta = {
	title: 'Security/PasskeysSection',
	component: PasskeysSection,
	args: {
		client: createFakeSecurityClient(),
		isSupported: true,
		register: async () => ({ ok: true })
	}
} satisfies Meta<typeof PasskeysSection>;

export default meta;

type Story = StoryObj<typeof meta>;

/** `M-Security`, `D-Security`: two keys with the device, the dates and a delete action. */
export const Default: Story = {};

/** `D-Security`, «Загрузка». */
export const Loading: Story = {
	args: { client: createFakeSecurityClient({ loading: true }) }
};

/** `D-Security`, «Пусто: ключей нет». */
export const Empty: Story = {
	args: { client: createFakeSecurityClient({ passkeys: [] }) }
};

export const LoadFailed: Story = {
	args: { client: createFakeSecurityClient({ failLists: true }) }
};

export const NotSupported: Story = {
	args: { isSupported: false }
};

/** `Kit-States`: the confirmation of the deletion sits inside the dialog, under the list. */
export const ConfirmDelete: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(await canvas.findByRole('button', { name: 'Удалить ключ доступа: MacBook · Chrome' }));
	}
};

/** `D-Security`, «Ошибка last-passkey: подсказка, не сбой»: the server refuses to delete the only key. */
export const LastPasskeyHint: Story = {
	args: {
		client: createFakeSecurityClient({
			deletePasskey: async () => ({ errorCode: 'last-passkey', message: 'Это последний способ входа.', ok: false }),
			passkeys: STORY_PASSKEYS.slice(0, 1)
		})
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await userEvent.click(await canvas.findByRole('button', { name: 'Удалить ключ доступа: iPhone 15 · Safari' }));
		await userEvent.click(await canvas.findByRole('button', { name: 'Удалить' }));
	}
};

export const RegistrationCancelled: Story = {
	args: {
		register: async () => {
			throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
		}
	},
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Добавить ключ доступа' }));
	}
};
