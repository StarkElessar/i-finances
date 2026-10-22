import css from './invitation-card.module.scss';

import { formatDeadline } from '@/shared/lib';
import { AppLogo, Typography } from '@/shared/ui';

import type { SignInMethodsController } from '@/features/auth';
import { SignInMethods } from '@/features/auth';

import type { InvitationPreview } from '@i-finances/contracts';
import { Show } from 'solid-js';

export type InvitationGuestCardProps = {
	controller: SignInMethodsController;
	preview: InvitationPreview;
};

/**
 * Card 1 of `Flow-Invite`: a guest who is not signed in. «Сергей приглашает вас в окружение «Семья»» and the ways to
 * sign in under it; after signing in the invitation page shows the confirmation. The controller is created by the page
 * only for a guest, so a signed-in person does not start a Telegram request here.
 */
export function InvitationGuestCard(props: InvitationGuestCardProps) {
	const deadline = () => formatDeadline(props.preview.expiresAt);

	return (
		<SignInMethods
			controller={props.controller}
			header={(
				<div class={css.header}>
					<AppLogo size='lg'/>
					<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
						{props.preview.inviterName} приглашает вас в окружение «{props.preview.householdName}»
					</Typography>
					<Typography tone='secondary' variant='body-md'>
						Войдите, чтобы присоединиться.
						<Show when={deadline()}>{(text) => ` Действует до ${text()}.`}</Show>
					</Typography>
				</div>
			)}
			hideDivider
		/>
	);
}
