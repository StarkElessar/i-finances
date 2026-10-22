import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { ConfirmPanel } from './confirm-panel';

const meta = {
	title: 'Kit/ConfirmPanel',
	component: ConfirmPanel,
	args: {
		confirmLabel: 'Удалить',
		description: 'Войти по нему с этого устройства станет нельзя. Другие способы входа остаются.',
		onCancel: () => undefined,
		onConfirm: () => undefined,
		title: 'Удалить ключ «MacBook · Chrome»?'
	}
} satisfies Meta<typeof ConfirmPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EndSessions: Story = {
	args: {
		confirmLabel: 'Завершить',
		description: 'Другие устройства выйдут из аккаунта. Этот сеанс останется.',
		title: 'Завершить все остальные сеансы?'
	}
};

export const Loading: Story = {
	args: { loading: true }
};

export const PrimaryTone: Story = {
	args: { confirmLabel: 'Продолжить', tone: 'primary' }
};
