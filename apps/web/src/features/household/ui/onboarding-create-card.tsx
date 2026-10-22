import css from './onboarding-card.module.scss';

import { Banner, Button, FlatCard, TextField, Typography } from '@/shared/ui';

import { CircleAlert } from 'lucide-solid';
import { Show } from 'solid-js';

export type OnboardingCreateCardProps = {
	name: string;
	nameError?: string;
	onNameInput: (value: string) => void;
	/** Why the request failed; the message sits in a banner (card 5). */
	error?: string;
	isSubmitting?: boolean;
	onSubmit: () => void;
	onBack: () => void;
};

/**
 * Cards 4 and 5 of `Flow-Onboarding`: «Создайте окружение», the name (by default «Семья») and the base currency, which
 * is BYN and cannot be chosen yet (Р4).
 */
export function OnboardingCreateCard(props: OnboardingCreateCardProps) {
	return (
		<form
			class={css.form}
			onSubmit={(event) => {
				event.preventDefault();

				if (!props.isSubmitting) {
					props.onSubmit();
				}
			}}
		>
			<div class={css.header}>
				<Typography as='h2' focusOnMount variant='heading-2'>Создайте окружение</Typography>
				<Typography tone='secondary' variant='body-md'>Общее место для счетов и операций семьи.</Typography>
			</div>
			<TextField
				autocomplete='off'
				disabled={props.isSubmitting}
				error={props.nameError}
				label='Название'
				maxLength={120}
				name='household-name'
				onInput={(event) => props.onNameInput(event.currentTarget.value)}
				placeholder='Например, Семья'
				required
				value={props.name}
			/>
			<FlatCard>
				<div class={css.currency}>
					<span>Основная валюта</span>
					<b class={css.currencyCode}>BYN</b>
				</div>
			</FlatCard>
			<Show when={props.error}>
				{(message) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{message()}</Banner>}
			</Show>
			<Button fullWidth loading={props.isSubmitting} size='lg' type='submit'>Создать окружение</Button>
			<Button disabled={props.isSubmitting} fullWidth onClick={() => props.onBack()} size='lg' variant='ghost'>Назад</Button>
		</form>
	);
}
