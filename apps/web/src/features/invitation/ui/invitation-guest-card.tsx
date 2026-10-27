import css from './invitation-card.module.scss';

import { formatDeadline } from '@/shared/lib';
import { AppLogo, Banner, Typography } from '@/shared/ui';

import type { SignInMethodsController } from '@/features/auth';
import { SignInMethods } from '@/features/auth';

import type { InvitationPreview } from '@i-finances/contracts';
import { CircleAlert } from 'lucide-solid';
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
	const isApp = () => props.preview.kind === 'app';
	const title = () => isApp()
		? 'Вас пригласили в i-finances'
		: `${props.preview.inviterName} приглашает вас в окружение «${props.preview.householdName}»`;
	const description = () => isApp()
		? `${props.preview.inviterName} приглашает вас вести финансы в i-finances. Создайте своё окружение для себя и семьи.`
		: 'Войдите или создайте аккаунт через Telegram, чтобы присоединиться.';

	return (
		<SignInMethods
			controller={props.controller}
			header={(
				<div class={css.header}>
					<AppLogo size='lg'/>
					<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
						{props.controller.view().isCancellable ? props.controller.view().title : title()}
					</Typography>
					<Typography tone='secondary' variant='body-md'>
						{description()}
						<Show when={deadline()}>{(text) => ` Действует до ${text()}.`}</Show>
					</Typography>
					<Typography tone='secondary' variant='body-md'>
						Нет аккаунта? Он создастся при первом входе через Telegram по этой ссылке. Без приглашения регистрация закрыта.
					</Typography>
					<Show when={props.controller.telegram.state().kind === 'unavailable'}>
						<Banner icon={<CircleAlert/>} role='status' tone='warning'>
							Вход через Telegram сейчас недоступен. Попробуйте позже.
						</Banner>
					</Show>
				</div>
			)}
			hideDivider
		/>
	);
}
