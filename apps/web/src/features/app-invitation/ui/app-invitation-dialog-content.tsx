import { useSetCurrentViewer } from '@/entities/viewer';

import { createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';

import { AppInvitationClient } from '../api/app-invitation-client';
import { type AppInvitationGateway, AppInvitationPanel } from '../model/app-invitation-panel';

import { AppInvitationDialogView } from './app-invitation-dialog-view';

export function AppInvitationDialogContent(props: { client?: AppInvitationGateway; onClose: () => void }) {
	const setViewer = useSetCurrentViewer();
	const panel = new AppInvitationPanel({
		gateway: props.client ?? new AppInvitationClient(),
		onAccessLost: () => setViewer({ isPlatformAdmin: false }),
		onChange: (next) => setState(next)
	});
	const [state, setState] = createSignal(panel.state);
	const [now, setNow] = createSignal(Date.now());
	const createRetryAt = createMemo(() => state().createRetryAt);

	createEffect(() => {
		const retryAt = createRetryAt();
		const currentTime = Date.now();

		setNow(currentTime);

		if (retryAt === undefined || retryAt <= currentTime) {
			return;
		}

		const timer = window.setInterval(() => {
			const currentTime = Date.now();

			setNow(currentTime);

			if (currentTime >= retryAt) {
				window.clearInterval(timer);
			}
		}, 1000);

		onCleanup(() => window.clearInterval(timer));
	});
	onMount(() => void panel.load());
	onCleanup(() => panel.dispose());

	return (
		<AppInvitationDialogView
			now={now()}
			onAskRevoke={(id) => panel.askRevoke(id)}
			onBack={() => panel.back()}
			onCancelRevoke={() => panel.cancelRevoke()}
			onClose={props.onClose}
			onConfirmRevoke={() => void panel.confirmRevoke()}
			onCreate={() => void panel.create()}
			onNoteInput={(note) => panel.setNote(note)}
			onRetry={() => void panel.load()}
			onStartCreate={() => panel.startCreate()}
			onToggleAccepted={() => panel.toggleAccepted()}
			state={state()}
		/>
	);
}
