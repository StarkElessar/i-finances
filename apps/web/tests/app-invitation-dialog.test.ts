// @vitest-environment jsdom
import type { AppInvitationGateway } from '@/features/app-invitation/model/app-invitation-panel';
import { AppInvitationDialog } from '@/features/app-invitation/ui/app-invitation-dialog';

import { fireEvent, screen } from '@testing-library/dom';
import { createComponent, createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderUi } from './render-ui';

function renderDialog() {
	const [open, setOpen] = createSignal(true);
	const client = {
		create: vi.fn<AppInvitationGateway['create']>().mockResolvedValue({
			invitation: {
				expiresAt: '2026-11-03T12:00:00.000Z', id: 'created-1', link: `https://ifinances.example/invite#${'x'.repeat(43)}`
			},
			ok: true
		}),
		list: vi.fn<AppInvitationGateway['list']>().mockResolvedValue({ invitations: [], ok: true }),
		revoke: vi.fn<AppInvitationGateway['revoke']>().mockResolvedValue({ ok: true })
	};

	renderUi(() => createComponent(AppInvitationDialog, {
		client,
		onOpenChange: setOpen,
		get open() {
			return open();
		}
	}));

	return { client, setOpen };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('application invitation dialog limits', () => {
	it('disables creation and keeps the daily-limit message until the dialog is reopened', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		const { client, setOpen } = renderDialog();
		const message = 'За сутки можно создать не больше 50 приглашений. Попробуйте позже.';

		client.create.mockResolvedValueOnce({ errorCode: 'rate-limited', message, ok: false });
		fireEvent.click(await screen.findByRole('button', { name: 'Создать приглашение' }));
		fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(message);
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeDisabled();
		fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Мария' } });
		expect(screen.getByRole('alert')).toHaveTextContent(message);
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeDisabled();
		fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
		expect(screen.getByRole('alert')).toHaveTextContent(message);
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeDisabled();
		expect(client.create).toHaveBeenCalledTimes(1);
		expect(setInterval).not.toHaveBeenCalledWith(expect.any(Function), 1000);
		setOpen(false);
		setOpen(true);
		await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeEnabled());
		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
		setOpen(false);
	});

	it('runs the countdown only during Retry-After, stopping at expiry and when the dialog closes', async () => {
		vi.useFakeTimers();
		const setInterval = vi.spyOn(window, 'setInterval');
		const clearInterval = vi.spyOn(window, 'clearInterval');
		const { client, setOpen } = renderDialog();
		const countdownTimers = () => setInterval.mock.calls.flatMap(([, delay], index) => (
			delay === 1000 ? [setInterval.mock.results[index]?.value] : []
		));

		client.create.mockResolvedValue({ errorCode: 'rate-limited', message: 'Попробуйте позже.', ok: false, retryAfterSeconds: 2 });
		await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeEnabled());
		expect(countdownTimers()).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(10_000);
		fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
		fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
		await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Повторите через 1 минуту.'));
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeDisabled();
		expect(countdownTimers()).toHaveLength(1);
		fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Мария' } });
		expect(countdownTimers()).toHaveLength(1);
		const firstTimer = countdownTimers()[0];

		await vi.advanceTimersByTimeAsync(1000);
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeDisabled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(screen.getByRole('button', { name: 'Создать приглашение' })).toBeEnabled();
		expect(screen.queryByRole('status')).not.toBeInTheDocument();
		expect(clearInterval).toHaveBeenCalledWith(firstTimer);
		fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));
		await vi.waitFor(() => expect(countdownTimers()).toHaveLength(2));
		const secondTimer = countdownTimers()[1];

		setOpen(false);
		expect(clearInterval).toHaveBeenCalledWith(secondTimer);
		await vi.advanceTimersByTimeAsync(2000);
		expect(countdownTimers()).toHaveLength(2);
	});
});
