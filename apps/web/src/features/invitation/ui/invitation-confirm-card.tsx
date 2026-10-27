import css from './invitation-card.module.scss';

import { Banner, Button, TextField, Typography } from '@/shared/ui';

import type { InvitationPreview } from '@i-finances/contracts';
import { CircleAlert, CircleCheck, RefreshCw, WifiOff } from 'lucide-solid';
import { Show } from 'solid-js';

import type { InvitationRequestProblem } from '../model/invitation-state';

export type InvitationConfirmCardProps = {
	preview: InvitationPreview;
	/** Flow-Invite, card 8: a new account confirms its name before joining. */
	newAccount?: { displayName: string; error?: string; onInput: (value: string) => void };
	/** The accept request is running. */
	isAccepting?: boolean;
	/** The last accept request failed: the banner of card 7 and «Повторить» instead of «Присоединиться». */
	problem?: { message: string; kind: InvitationRequestProblem };
	onAccept: () => void;
	onCancel: () => void;
};

/**
 * Cards 3 and 7 of `Flow-Invite`: a signed-in person is asked «Присоединиться к «Семья»?», and after a failed attempt
 * the same card says what went wrong and offers «Повторить».
 */
export function InvitationConfirmCard(props: InvitationConfirmCardProps) {
	return (
		<form
			class={css.root}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();

				if (!props.isAccepting) {
					props.onAccept();
				}
			}}
		>
			<Show when={props.newAccount}>
				<Banner icon={<CircleCheck/>} role='status' tone='success'>Аккаунт создан</Banner>
			</Show>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
					Присоединиться к «{props.preview.householdName}»?
				</Typography>
				<Show when={!props.problem}>
					<Typography tone='secondary' variant='body-md'>
						Приглашает {props.preview.inviterName}. Вы увидите все счета и операции окружения.
					</Typography>
				</Show>
			</div>
			<Show when={props.newAccount}>
				{(account) => (
					<TextField
						autocomplete='name'
						disabled={props.isAccepting}
						error={account().error}
						hint='Так вас увидят участники окружения. Можно изменить'
						label='Ваше имя'
						maxLength={100}
						name='display-name'
						onInput={(event) => account().onInput(event.currentTarget.value)}
						required
						value={account().displayName}
					/>
				)}
			</Show>
			<Show when={props.problem}>
				{(problem) => (
					<Banner icon={problem().kind === 'network' ? <WifiOff/> : <CircleAlert/>} role='alert' tone='danger'>
						{problem().message}
					</Banner>
				)}
			</Show>
			<Button
				fullWidth
				loading={props.isAccepting}
				size='lg'
				startIcon={props.problem ? <RefreshCw/> : undefined}
				type='submit'
			>
				{props.problem ? 'Повторить' : 'Присоединиться'}
			</Button>
			<Button disabled={props.isAccepting} fullWidth onClick={() => props.onCancel()} size='lg' variant='ghost'>Отмена</Button>
		</form>
	);
}
