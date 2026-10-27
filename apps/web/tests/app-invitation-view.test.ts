import type { AppInvitationPanelState } from '@/features/app-invitation/model/app-invitation-panel-state';
import { AppInvitationForm } from '@/features/app-invitation/ui/app-invitation-form';
import { AppInvitationLists } from '@/features/app-invitation/ui/app-invitation-lists';
import { CreatedAppInvitation } from '@/features/app-invitation/ui/created-app-invitation';
import { OnboardingWelcomeCard } from '@/features/household/ui/onboarding-welcome-card';

import { createComponent } from 'solid-js';
import { renderToString } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';

describe('onboarding invitation-only card', () => {
	it.each([undefined, 'Семья'])('explains creation rights below the invitation field (lost household: %s)', (lostHouseholdName) => {
		const html = renderToString(() => createComponent(OnboardingWelcomeCard, {
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

		expect(html).toContain('Создать своё окружение можно только по приглашению в приложение.');
		expect(html.indexOf('Ссылка-приглашение')).toBeLessThan(html.indexOf('Создать своё окружение можно'));
		expect(html).toContain('Так вас увидят участники окружения. Можно изменить');
		expect(html).not.toContain('Что вы хотите сделать');
	});

	it('does not show the restriction to a person allowed to create a household', () => {
		const html = renderToString(() => createComponent(OnboardingWelcomeCard, {
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

		expect(html).not.toContain('Создать своё окружение можно только');
	});
});

function renderLists(count: number, expanded: boolean): string {
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

	return renderToString(() => createComponent(AppInvitationLists, {
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

		expect(preview.match(/Гость-/g)).toHaveLength(5);
		expect(preview).toContain('Смотреть далее');
		expect(preview).toContain('aria-expanded="false"');
		expect(expanded.match(/Гость-/g)).toHaveLength(8);
		expect(expanded).toContain('Свернуть');
		expect(expanded).toContain('aria-expanded="true"');
		expect(preview).toContain('без @логина');
		expect(preview).toContain('@guest_1');
	});

	it.each([0, 1, 5])('has no expansion control for %i accepted invitations', (count) => {
		const html = renderLists(count, false);

		expect(html).not.toContain('Смотреть далее');
		expect(html).not.toContain('Свернуть');
	});
});

describe('application invitation form and created link', () => {
	it('shows the optional note, its error and the counter even when the limit is exceeded', () => {
		const html = renderToString(() => createComponent(AppInvitationForm, {
			error: 'Заметка не длиннее 80 символов.',
			id: 'create-invitation',
			loading: false,
			note: 'я'.repeat(81),
			onCreate: vi.fn(),
			onNoteInput: vi.fn()
		}));

		expect(html).toContain('Для кого');
		expect(html).toContain('необязательно');
		expect(html).toContain('81 / 80');
		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('Заметка не длиннее 80 символов.');
	});

	it.each([false, true])('shows a readonly one-time link and offers share only when available: %s', (canShare) => {
		const html = renderToString(() => createComponent(CreatedAppInvitation, {
			canShare,
			invitation: {
				expiresAt: '2026-11-03T12:00:00.000Z', id: 'created-1', link: `https://ifinances.example/invite#${'x'.repeat(43)}`
			}
		}));

		expect(html).toContain('readonly');
		expect(html).toContain('Скопировать');
		expect(html.includes('Поделиться')).toBe(canShare);
		expect(html).toContain('Ссылка одноразовая и действует 7 дней.');
		expect(html).toContain('Пересылайте её только тому, кого приглашаете. Показывается один раз.');
	});
});
