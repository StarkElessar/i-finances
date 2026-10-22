import css from './invitation-card.module.scss';

import { Banner, Button, Typography } from '@/shared/ui';

import { CircleCheck } from 'lucide-solid';

export type InvitationAcceptedCardProps = {
	householdName: string;
	/** The person's name for the greeting; without it the greeting has no name. */
	displayName?: string;
	onOpen: () => void;
};

/** Card 4 of `Flow-Invite`: the person has joined as a member. */
export function InvitationAcceptedCard(props: InvitationAcceptedCardProps) {
	return (
		<div class={css.root}>
			<Banner icon={<CircleCheck/>} role='status' title='Готово.' tone='success'>
				Вы в окружении «{props.householdName}».
			</Banner>
			<div class={css.header}>
				<Typography as='h2' class={css.title} focusOnMount variant='heading-2'>
					{props.displayName ? `Добро пожаловать, ${props.displayName}` : 'Добро пожаловать'}
				</Typography>
			</div>
			<Button fullWidth onClick={() => props.onOpen()} size='lg'>Открыть главную</Button>
		</div>
	);
}
