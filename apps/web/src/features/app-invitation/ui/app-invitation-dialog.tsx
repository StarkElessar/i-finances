import css from './app-invitation-dialog.module.scss';

import { Dialog } from '@/shared/ui';

import { Show } from 'solid-js';

import type { AppInvitationGateway } from '../model/app-invitation-panel';

import { AppInvitationDialogContent } from './app-invitation-dialog-content';

export type AppInvitationDialogProps = {
	open: boolean;
	client?: AppInvitationGateway;
	onOpenChange: (open: boolean) => void;
};

/** The kit adapts 560 px on desktop to a full-width sheet below 640 px. */
export function AppInvitationDialog(props: AppInvitationDialogProps) {
	return (
		<Dialog.Root onOpenChange={props.onOpenChange} open={props.open}>
			<Dialog.Content class={css.dialog}>
				<Show when={props.open}>
					<AppInvitationDialogContent client={props.client} onClose={() => props.onOpenChange(false)}/>
				</Show>
			</Dialog.Content>
		</Dialog.Root>
	);
}
