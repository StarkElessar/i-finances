import { PageCard } from '@/shared/ui';

import type { InvitationPreview } from '@i-finances/contracts';
import type { Meta, StoryObj } from 'storybook-solidjs-vite';

import { InvitationAcceptedCard } from './invitation-accepted-card';
import { InvitationAlreadyCard } from './invitation-already-card';
import { InvitationConfirmCard } from './invitation-confirm-card';
import { InvitationLoadingCard } from './invitation-loading-card';
import { InvitationReplaceCard } from './invitation-replace-card';
import { InvitationUnavailableCard } from './invitation-unavailable-card';

const PREVIEW: InvitationPreview = {
	expiresAt: '2026-10-25T18:04:00.000Z',
	householdName: 'Семья',
	inviterName: 'Сергей'
};

const noop = () => {};

// Each story is one card of the board `Flow-Invite`, inside the page frame. The guest card needs the sign-in
// controller (a Telegram request), so it is shown on the page itself, not here.
const meta = {
	title: 'Invitation/Cards',
	component: InvitationConfirmCard,
	args: { onAccept: noop, onCancel: noop, preview: PREVIEW },
	parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof InvitationConfirmCard>;

export default meta;

type Story = StoryObj<typeof meta>;

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
