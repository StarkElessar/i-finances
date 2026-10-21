import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { PasswordField } from './password-field';

const meta = {
	title: 'Kit/PasswordField',
	component: PasswordField,
	args: {
		autocomplete: 'new-password',
		label: 'Новый пароль',
		value: 'correct horse battery'
	}
} satisfies Meta<typeof PasswordField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: { hint: 'Не короче 12 символов. Другие сеансы будут завершены' }
};

export const Empty: Story = {
	args: { placeholder: 'Не короче 12 символов', value: '' }
};

export const WrongPassword: Story = {
	args: { error: 'Неверный текущий пароль', label: 'Текущий пароль' }
};

export const Disabled: Story = {
	args: { disabled: true }
};

export const Focus: Story = {
	parameters: { pseudo: { focusWithin: true } }
};
