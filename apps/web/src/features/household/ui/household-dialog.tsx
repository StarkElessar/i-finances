import css from './household-dialog.module.scss';

import { Dialog } from '@/shared/ui';

import { useCurrentViewer, useSetCurrentViewer } from '@/entities/viewer';

import { query } from '@solidjs/router';
import { createSignal, onCleanup, onMount } from 'solid-js';

import { HouseholdClient } from '../api/household-client';
import { HouseholdInvitationClient } from '../api/household-invitation-client';
import { HouseholdPanel } from '../model/household-panel';
import type { HouseholdPanelState } from '../model/household-panel-state';

import { HouseholdPanelView } from './household-panel-view';

/** The labels «Осталось 6 д 23 ч» are to the minute; refreshing twice a minute keeps them true without a timer per row. */
const CLOCK_TICK_MS = 30_000;

export type HouseholdDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type HouseholdDialogContentProps = {
	onClose: () => void;
};

function HouseholdDialogContent(props: HouseholdDialogContentProps) {
	const viewer = useCurrentViewer();
	const setCurrentViewer = useSetCurrentViewer();
	const [state, setState] = createSignal<HouseholdPanelState>({ load: 'loading' });
	const [now, setNow] = createSignal(Date.now());
	const panel = new HouseholdPanel({
		gateway: { household: new HouseholdClient(), invitations: new HouseholdInvitationClient() },
		onChange: setState,
		onLeft: () => {
			// The person is out: the patch sends the app to the onboarding, and what was loaded for the household goes.
			setCurrentViewer({ household: null });
			query.clear();
			props.onClose();
		},
		onRenamed: (household) => setCurrentViewer({ household })
	});

	onMount(() => {
		const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);

		onCleanup(() => window.clearInterval(timer));
		void panel.load();
	});
	onCleanup(() => panel.dispose());

	return (
		<>
			<Dialog.Header closeLabel='Закрыть окружение'>
				<Dialog.Title>{state().household ? `Окружение «${state().household?.name}»` : 'Окружение'}</Dialog.Title>
				<Dialog.Description>Участники и приглашения</Dialog.Description>
			</Dialog.Header>
			<Dialog.Body class={css.body}>
				<HouseholdPanelView
					now={now()}
					onAskLeave={() => panel.ask({ kind: 'leave' })}
					onAskRemove={(member) => panel.ask({ kind: 'remove', member })}
					onCancelConfirmation={() => panel.cancelConfirmation()}
					onConfirm={() => void panel.confirm()}
					onCreateInvitation={() => void panel.createInvitation()}
					onDismissCreatedInvitation={() => panel.dismissCreatedInvitation()}
					onRename={(name) => void panel.rename(name)}
					onRetryInvitations={() => void panel.loadInvitations()}
					onRetryLoad={() => void panel.load()}
					onRevokeInvitation={(id) => void panel.revokeInvitation(id)}
					state={state()}
					viewerId={viewer()?.id ?? ''}
				/>
			</Dialog.Body>
		</>
	);
}

/**
 * «Окружение» from the profile menu (boards `M-Household`, `D-Household`, U5): a bottom sheet on a phone, a dialog of
 * 560 px from 640. Every opening starts from a fresh load, so a link of an invitation created earlier is never shown
 * again.
 */
export function HouseholdDialog(props: HouseholdDialogProps) {
	return (
		<Dialog.Root onOpenChange={props.onOpenChange} open={props.open}>
			<Dialog.Content class={css.dialog}>
				<HouseholdDialogContent onClose={() => props.onOpenChange(false)}/>
			</Dialog.Content>
		</Dialog.Root>
	);
}
