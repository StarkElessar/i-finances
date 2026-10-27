import css from './invitation-card.module.scss';

import { Banner, Button, FlatCard, Typography } from '@/shared/ui';

import type { InvitationKind } from '@i-finances/contracts';
import { CircleAlert } from 'lucide-solid';
import { Show } from 'solid-js';

export type InvitationAlreadyCardProps = {
	/** The name of the household the person is in; the API names it with the refusal. */
	currentHouseholdName?: string;
	invitationKind?: InvitationKind;
	onDismiss: () => void;
};

/**
 * Card 5 of `Flow-Invite`: the person is in another household, and the data of two households is never merged
 * silently, so they have to leave the current one first.
 */
export function InvitationAlreadyCard(props: InvitationAlreadyCardProps) {
	const isApp = () => props.invitationKind === 'app';
	const title = () => {
		if (isApp()) {
			return 'Вы уже зарегистрированы';
		}

		return props.currentHouseholdName === undefined ? 'Вы уже в окружении' : `Вы уже в окружении «${props.currentHouseholdName}»`;
	};

	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
					{title()}
				</Typography>
			</div>
			<Banner icon={<CircleAlert/>} role='status' tone='warning'>
				{isApp()
					? 'Этот аккаунт уже зарегистрирован в i-finances. Приглашение предназначено для нового человека.'
					: 'Чтобы перейти, сначала покиньте его. Данные одного окружения нельзя молча слить с другим.'}
			</Banner>
			<Show when={!isApp() && props.currentHouseholdName}>
				{(name) => <FlatCard title={name()}>Ваше текущее окружение</FlatCard>}
			</Show>
			<Button fullWidth onClick={() => props.onDismiss()} size='lg' variant='secondary'>
				{isApp() ? 'Перейти в приложение' : 'Понятно'}
			</Button>
		</div>
	);
}
