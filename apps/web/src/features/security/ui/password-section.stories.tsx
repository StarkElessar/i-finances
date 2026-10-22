import { userEvent, within } from 'storybook/test';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import type { ChangePasswordResponse } from '../api';

import { PasswordSection, type PasswordSectionProps } from './password-section';

/** The answer of the password change, whatever the story needs. */
const answer = (response: ChangePasswordResponse): PasswordSectionProps['change'] => async () => response;

const meta = {
	title: 'Security/PasswordSection',
	component: PasswordSection,
	args: {
		change: answer({ result: { ok: true, revokedSessionCount: 2 } }),
		hasPassword: true,
		onChanged: () => undefined
	}
} satisfies Meta<typeof PasswordSection>;

export default meta;

type Story = StoryObj<typeof meta>;

async function fillAndSubmit(canvasElement: HTMLElement, current: string, next: string) {
	const canvas = within(canvasElement);

	await userEvent.type(await canvas.findByLabelText('Текущий пароль'), current);
	await userEvent.type(await canvas.findByLabelText('Новый пароль'), next);
	await userEvent.click(await canvas.findByRole('button', { name: 'Сменить пароль' }));
}

export const Default: Story = {};

/** `D-Security`, «Неверный текущий пароль» at the field. */
export const WrongCurrentPassword: Story = {
	args: {
		change: answer({
			result: {
				errorCode: 'invalid-current-password',
				fieldErrors: { currentPassword: 'Текущий пароль указан неверно.' },
				message: 'Текущий пароль указан неверно.',
				ok: false
			}
		})
	},
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'another long password 1')
};

/** The same rule as the server, checked before any request. */
export const ShortNewPassword: Story = {
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'short')
};

/** `D-Security`, «Смена пароля: успех». */
export const Changed: Story = {
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'another long password 1')
};

/** `D-Security`, «429: слишком много попыток», with the wait the server named: the form rests. */
export const RateLimitedWithWait: Story = {
	args: {
		change: answer({
			result: { errorCode: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.', ok: false },
			retryAfterSeconds: 240
		})
	},
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'another long password 1')
};

/** A 429 without a named wait: only the text, the form stays open (nothing is retried by itself). */
export const RateLimited: Story = {
	args: {
		change: answer({ result: { errorCode: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.', ok: false } })
	},
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'another long password 1')
};

export const PasswordNotSet: Story = {
	args: {
		change: answer({
			result: { errorCode: 'password-not-set', message: 'У аккаунта нет пароля, поэтому его нельзя сменить.', ok: false }
		})
	},
	play: ({ canvasElement }) => fillAndSubmit(canvasElement, 'old password 1', 'another long password 1')
};

/** `D-Security`, «Аккаунт без пароля» (a future screen, v2): a plain explanation and no «Задать пароль». */
export const NoPassword: Story = {
	args: { hasPassword: false }
};
