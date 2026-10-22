import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { InlineConfirm } from './inline-confirm';

const meta = {
	title: 'Kit/InlineConfirm',
	component: InlineConfirm,
	args: {
		confirmLabel: 'Удалить участника',
		description: 'Её сеансы будут завершены, операции останутся. Войти снова она сможет, но без доступа к окружению.',
		onCancel: () => undefined,
		onConfirm: () => undefined,
		title: 'Удалить Анну из окружения?'
	}
} satisfies Meta<typeof InlineConfirm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
	args: { loading: true }
};

export const WithError: Story = {
	args: { error: 'Не удалось удалить участника. Проверьте соединение и повторите.' }
};

export const Leave: Story = {
	args: {
		confirmLabel: 'Покинуть',
		description: 'Вы потеряете доступ к его данным. Вернуться можно только по новому приглашению.',
		title: 'Покинуть окружение «Семья»?'
	}
};
