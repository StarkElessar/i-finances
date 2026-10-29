// @vitest-environment jsdom
import type { AppInvitationPanelState } from '@/features/app-invitation/model/app-invitation-panel-state';
import { AppInvitationForm } from '@/features/app-invitation/ui/app-invitation-form';
import { AppInvitationLists } from '@/features/app-invitation/ui/app-invitation-lists';
import { CreatedAppInvitation } from '@/features/app-invitation/ui/created-app-invitation';
import { OnboardingWelcomeCard } from '@/features/household/ui/onboarding-welcome-card';

import { within } from '@testing-library/dom';
import { createComponent } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';

import { renderUi } from './render-ui';

describe('onboarding invitation-only card', () => {
	it.each([undefined, 'Семья'])('explains creation rights below the invitation field (lost household: %s)', (lostHouseholdName) => {
		const host = renderUi(() => createComponent(OnboardingWelcomeCard, {
			canContinue: false,
			canCreateHousehold: false,
			choice: 'invite',
			displayName: 'Анна',
			link: '',
			lostHouseholdName,
			onChoice: vi.fn(),
			onContinue: vi.fn(),
			onDisplayNameInput: vi.fn(),
			onLinkInput: vi.fn(),
			onSignOut: vi.fn()
		}));

		const text = host.textContent;

		expect(host).toHaveTextContent('Создать своё окружение можно только по приглашению в приложение.');
		expect(within(host).getByRole('textbox', { name: 'Ссылка-приглашение' })).toBeInTheDocument();
		expect(text.indexOf('Ссылка-приглашение')).toBeLessThan(text.indexOf('Создать своё окружение можно'));
		expect(host).toHaveTextContent('Так вас увидят участники окружения. Можно изменить');
		expect(host).not.toHaveTextContent('Что вы хотите сделать');
	});

	it('does not show the restriction to a person allowed to create a household', () => {
		const host = renderUi(() => createComponent(OnboardingWelcomeCard, {
			canContinue: false,
			canCreateHousehold: true,
			choice: 'invite',
			displayName: 'Анна',
			link: '',
			onChoice: vi.fn(),
			onContinue: vi.fn(),
			onDisplayNameInput: vi.fn(),
			onLinkInput: vi.fn(),
			onSignOut: vi.fn()
		}));

		expect(host).not.toHaveTextContent('Создать своё окружение можно только');
	});
});

function renderLists(count: number, expanded: boolean): HTMLElement {
	const state: AppInvitationPanelState = {
		expanded,
		invitations: Array.from({ length: count }, (_, index) => ({
			acceptedAt: '2026-10-27T12:00:00.000Z',
			acceptedBy: { displayName: `Гость-${index}`, telegramUsername: index === 0 ? null : `guest_${index}` },
			createdAt: '2026-10-20T12:00:00.000Z',
			expiresAt: '2026-10-27T12:00:00.000Z',
			id: `accepted-${index}`,
			note: null,
			status: 'accepted'
		})),
		load: 'ready',
		note: '',
		view: 'main'
	};

	return renderUi(() => createComponent(AppInvitationLists, {
		onAskRevoke: vi.fn(),
		onCancelRevoke: vi.fn(),
		onConfirmRevoke: vi.fn(),
		onToggleAccepted: vi.fn(),
		state
	}));
}

describe('accepted invitation list markup', () => {
	it('renders five records with an accessible expansion control, then all eight with collapse', () => {
		const preview = renderLists(8, false);
		const expanded = renderLists(8, true);

		expect(within(preview).getAllByText(/Гость-/)).toHaveLength(5);
		expect(within(preview).getByRole('button', { name: 'Смотреть далее' })).toHaveAttribute('aria-expanded', 'false');
		expect(within(expanded).getAllByText(/Гость-/)).toHaveLength(8);
		expect(within(expanded).getByRole('button', { name: 'Свернуть' })).toHaveAttribute('aria-expanded', 'true');
		expect(preview).toHaveTextContent('без @логина');
		expect(preview).toHaveTextContent('@guest_1');
	});

	it.each([0, 1, 5])('has no expansion control for %i accepted invitations', (count) => {
		const host = renderLists(count, false);

		expect(within(host).queryByRole('button', { name: 'Смотреть далее' })).not.toBeInTheDocument();
		expect(within(host).queryByRole('button', { name: 'Свернуть' })).not.toBeInTheDocument();
	});
});

describe('application invitation form and created link', () => {
	it('shows the optional note, its error and the counter even when the limit is exceeded', () => {
		const host = renderUi(() => createComponent(AppInvitationForm, {
			error: 'Заметка не длиннее 80 символов.',
			id: 'create-invitation',
			loading: false,
			note: 'я'.repeat(81),
			onCreate: vi.fn(),
			onNoteInput: vi.fn()
		}));

		expect(within(host).getByRole('textbox', { name: 'Для кого необязательно' })).toHaveAttribute('aria-invalid', 'true');
		expect(host).toHaveTextContent('81 / 80');
		expect(host).toHaveTextContent('Заметка не длиннее 80 символов.');
	});

	it('counts the trimmed note so 80 characters and a trailing space stay within the limit', () => {
		const host = renderUi(() => createComponent(AppInvitationForm, {
			id: 'create-invitation',
			loading: false,
			note: `${'я'.repeat(80)} `,
			onCreate: vi.fn(),
			onNoteInput: vi.fn()
		}));

		expect(host).toHaveTextContent('80 / 80');
		expect(within(host).getByRole('textbox')).not.toHaveAttribute('aria-invalid');
	});

	it.each([false, true])('shows a readonly one-time link and offers share only when available: %s', (canShare) => {
		const host = renderUi(() => createComponent(CreatedAppInvitation, {
			canShare,
			invitation: {
				expiresAt: '2026-11-03T12:00:00.000Z', id: 'created-1', link: `https://ifinances.example/invite#${'x'.repeat(43)}`
			}
		}));

		expect(within(host).getByRole('textbox', { name: 'Ссылка-приглашение' })).toHaveAttribute('readonly');
		expect(within(host).getByRole('button', { name: 'Скопировать' })).toBeInTheDocument();
		expect(within(host).queryByRole('button', { name: 'Поделиться' }) !== null).toBe(canShare);
		expect(host).toHaveTextContent('Ссылка одноразовая и действует 7 дней.');
		expect(host).toHaveTextContent('Пересылайте её только тому, кого приглашаете. Показывается один раз.');
	});
});
