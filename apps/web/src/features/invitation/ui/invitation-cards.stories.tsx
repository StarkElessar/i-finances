import { PageCard } from '@/shared/ui';

import { AuthClient, type SignInMethodsController } from '@/features/auth';
import { describeSignInCard } from '@/features/auth/model/sign-in-card-view';
import type { TelegramSignInState } from '@/features/auth/model/telegram-sign-in-state';
import { OnboardingCreateCard } from '@/features/household';

import type { InvitationPreview } from '@i-finances/contracts';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { InvitationAcceptedCard } from './invitation-accepted-card';
import { InvitationAlreadyCard } from './invitation-already-card';
import { InvitationConfirmCard } from './invitation-confirm-card';
import { InvitationGuestCard } from './invitation-guest-card';
import { InvitationLoadingCard } from './invitation-loading-card';
import { InvitationReplaceCard } from './invitation-replace-card';
import { InvitationUnavailableCard } from './invitation-unavailable-card';

const PREVIEW: InvitationPreview = {
	expiresAt: '2026-10-25T18:04:00.000Z',
	householdName: 'Семья',
	inviterName: 'Сергей'
};

const noop = () => {};

const APP_PREVIEW: InvitationPreview = {
	expiresAt: PREVIEW.expiresAt,
	inviterName: 'Сергей',
	kind: 'app'
};

const LINK = {
	appUrl: 'tg://resolve?domain=i_finances_bot&start=example',
	botUrl: 'https://t.me/i_finances_bot?start=example',
	code: 'example',
	expiresAtMs: 0,
	ttlMinutes: 10
};

/** A static sign-in controller: the real guest card and shared auth states, without requests or polling. */
function renderGuest(state: TelegramSignInState, preview = APP_PREVIEW) {
	const controller: SignInMethodsController = {
		botUrl: () => state.kind === 'ready' || state.kind === 'waiting' ? state.link.botUrl : undefined,
		client: new AuthClient({ fetcher: async () => new Response(null, { status: 503 }) }),
		isConfirmed: () => state.kind === 'confirmed',
		isSessionLoading: () => false,
		method: () => 'options',
		onSignedIn: noop,
		passkey: { error: () => undefined, isPending: () => false, signIn: async () => {} },
		session: () => undefined,
		setMethod: noop,
		signOut: async () => {},
		telegram: { cancel: noop, openTelegram: noop, start: noop, state: () => state },
		view: () => describeSignInCard(state)
	};

	return <PageCard><InvitationGuestCard controller={controller} preview={preview}/></PageCard>;
}

// Cards of Flow-Invite and Flow-AppInvite use the same frame and primitives.
const meta = {
	title: 'Invitation/Cards',
	component: InvitationConfirmCard,
	args: { onAccept: noop, onCancel: noop, preview: PREVIEW },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof InvitationConfirmCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Guest: Story = {
	render: () => renderGuest({ kind: 'ready', link: LINK }, PREVIEW)
};

export const AppGuest: Story = {
	render: () => renderGuest({ kind: 'ready', link: LINK })
};

export const AppPreparing: Story = {
	render: () => renderGuest({ kind: 'preparing' })
};

export const AppWaiting: Story = {
	render: () => renderGuest({ connectionLost: false, kind: 'waiting', link: LINK })
};

export const AppSignInNetworkError: Story = {
	render: () => renderGuest({ kind: 'failed', message: '', reason: 'network' })
};

export const AppRateLimited: Story = {
	render: () => renderGuest({ kind: 'failed', message: '', reason: 'rate-limited', retryAfterSeconds: 300 })
};

export const AppTelegramUnavailable: Story = {
	render: () => renderGuest({ kind: 'unavailable' })
};

export const AppAlreadyRegistered: Story = {
	render: () => <PageCard><InvitationAlreadyCard invitationKind='app' onDismiss={noop}/></PageCard>
};

export const AppCreateHousehold: Story = {
	render: () => (
		<PageCard>
			<OnboardingCreateCard
				name='Семья'
				newAccount={{ displayName: 'Анна', onInput: noop }}
				onNameInput={noop}
				onSubmit={noop}
			/>
		</PageCard>
	)
};

export const NewAccount: Story = {
	render: () => (
		<PageCard>
			<InvitationConfirmCard
				newAccount={{ displayName: 'Анна', onInput: noop }}
				onAccept={noop}
				onCancel={noop}
				preview={PREVIEW}
			/>
		</PageCard>
	)
};

/** 2. Ссылка недействительна: срок. */
export const Expired: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='expired' onDismiss={noop}/></PageCard>
};

export const Used: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='used' onDismiss={noop}/></PageCard>
};

export const Revoked: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='revoked' onDismiss={noop}/></PageCard>
};

/** The token is well-formed but nobody has it: no «набрана с ошибкой», a new link is asked for. */
export const Unknown: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='unknown' onDismiss={noop}/></PageCard>
};

export const Malformed: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='malformed' onDismiss={noop}/></PageCard>
};

export const NoReason: Story = {
	render: () => <PageCard><InvitationUnavailableCard cause='unspecified' onDismiss={noop}/></PageCard>
};

/** 3. Гость вошёл: подтверждение. */
export const Confirm: Story = {
	render: () => <PageCard><InvitationConfirmCard onAccept={noop} onCancel={noop} preview={PREVIEW}/></PageCard>
};

export const Accepting: Story = {
	render: () => <PageCard><InvitationConfirmCard isAccepting onAccept={noop} onCancel={noop} preview={PREVIEW}/></PageCard>
};

/** 7. Ошибка сети. */
export const NetworkError: Story = {
	render: () => (
		<PageCard>
			<InvitationConfirmCard
				onAccept={noop}
				onCancel={noop}
				preview={PREVIEW}
				problem={{ kind: 'network', message: 'Не удалось присоединиться. Проверьте соединение и повторите.' }}
			/>
		</PageCard>
	)
};

/** 4. Успех. */
export const Accepted: Story = {
	render: () => <PageCard><InvitationAcceptedCard displayName='Анна' householdName='Семья' onOpen={noop}/></PageCard>
};

/** 5. Уже в другом окружении. */
export const AlreadyInHousehold: Story = {
	render: () => <PageCard><InvitationAlreadyCard currentHouseholdName='Дом' onDismiss={noop}/></PageCard>
};

/** 6. Согласие: своё пустое окружение будет удалено. */
export const ConsentToReplace: Story = {
	render: () => (
		<PageCard>
			<InvitationReplaceCard currentHouseholdName='Дом' onCancel={noop} onConfirm={noop} preview={PREVIEW}/>
		</PageCard>
	)
};

export const ConsentFailed: Story = {
	render: () => (
		<PageCard>
			<InvitationReplaceCard
				currentHouseholdName='Дом'
				error='Не удалось присоединиться. Проверьте соединение и повторите.'
				onCancel={noop}
				onConfirm={noop}
				preview={PREVIEW}
			/>
		</PageCard>
	)
};

export const Checking: Story = {
	render: () => <PageCard><InvitationLoadingCard onCancel={noop} onRetry={noop}/></PageCard>
};

export const CheckFailed: Story = {
	render: () => (
		<PageCard>
			<InvitationLoadingCard
				onCancel={noop}
				onRetry={noop}
				problem={{ kind: 'network', message: 'Не удалось загрузить приглашение. Проверьте соединение и повторите.' }}
			/>
		</PageCard>
	)
};

// A dead link and a failed preview do not disclose its kind: both flows share these cards and texts.
export const AppExpired: Story = { ...Expired };

export const AppUsed: Story = { ...Used };

export const AppRevoked: Story = { ...Revoked };

export const AppUnknown: Story = { ...Unknown };

export const AppChecking: Story = { ...Checking };

export const AppCheckFailed: Story = { ...CheckFailed };

export const CheckRateLimited: Story = {
	render: () => (
		<PageCard>
			<InvitationLoadingCard
				onCancel={noop}
				onRetry={noop}
				problem={{ kind: 'rate-limited', message: 'Слишком много попыток. Попробуйте позже.' }}
			/>
		</PageCard>
	)
};
