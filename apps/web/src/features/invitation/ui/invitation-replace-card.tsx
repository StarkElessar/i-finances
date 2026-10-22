import css from './invitation-card.module.scss';

import { Banner, Button, FlatCard, Typography } from '@/shared/ui';

import type { InvitationPreview } from '@i-finances/contracts';
import { CircleAlert } from 'lucide-solid';
import { Show } from 'solid-js';

export type InvitationReplaceCardProps = {
	preview: InvitationPreview;
	/** The name of the person's own empty household that goes away; the API names it with the refusal. */
	currentHouseholdName: string | undefined;
	isAccepting?: boolean;
	/** Why the repeated request failed. */
	error?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

/**
 * Card 6 of `Flow-Invite`: the person already has an empty household of their own, and joining deletes it. Nothing
 * has changed until they press the consent button, which repeats the request with `replaceEmptyHousehold: true`.
 */
export function InvitationReplaceCard(props: InvitationReplaceCardProps) {
	const warning = () => props.currentHouseholdName === undefined
		? 'Ваше окружение будет удалено.'
		: `Окружение «${props.currentHouseholdName}» будет удалено.`;

	return (
		<div class={css.root}>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
					Присоединиться к «{props.preview.householdName}»?
				</Typography>
				<Typography tone='secondary' variant='body-md'>
					Приглашает {props.preview.inviterName}. Вы уже состоите в своём окружении, и оно пустое.
				</Typography>
			</div>
			<Show when={props.currentHouseholdName}>
				{(name) => <FlatCard title={name()}>Вы один · нет счетов, операций, переводов, чеков, контактов и категорий</FlatCard>}
			</Show>
			<Banner icon={<CircleAlert/>} tone='warning' title={warning()}>
				Пока вы не согласились, ничего не изменено.
			</Banner>
			<Show when={props.error}>
				{(message) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{message()}</Banner>}
			</Show>
			<Button fullWidth loading={props.isAccepting} onClick={() => props.onConfirm()} size='lg'>
				{props.currentHouseholdName === undefined
					? 'Удалить своё окружение и присоединиться'
					: `Удалить «${props.currentHouseholdName}» и присоединиться`}
			</Button>
			<Button disabled={props.isAccepting} fullWidth onClick={() => props.onCancel()} size='lg' variant='ghost'>Отмена</Button>
		</div>
	);
}
