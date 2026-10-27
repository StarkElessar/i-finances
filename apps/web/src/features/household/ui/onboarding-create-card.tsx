import css from './onboarding-card.module.scss';

import { Banner, Button, FlatCard, TextField, Typography } from '@/shared/ui';

import { CircleAlert, CircleCheck } from 'lucide-solid';
import { Show } from 'solid-js';

export type OnboardingCreateCardProps = {
	/** Flow-AppInvite: name and household are confirmed together, without the welcome choice. */
	newAccount?: { displayName: string; error?: string; onInput: (value: string) => void };
	name: string;
	nameError?: string;
	onNameInput: (value: string) => void;
	/** Why the request failed; the message sits in a banner (card 5). */
	error?: string;
	isSubmitting?: boolean;
	onSubmit: () => void;
	onBack?: () => void;
};

/**
 * Cards 4 and 5 of `Flow-Onboarding`: «Создайте окружение», the name (by default «Семья») and the base currency, which
 * is BYN and cannot be chosen yet (Р4).
 */
export function OnboardingCreateCard(props: OnboardingCreateCardProps) {
	return (
		<form
			class={css.form}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();

				if (!props.isSubmitting) {
					props.onSubmit();
				}
			}}
		>
			<Show when={props.newAccount}>
				<Banner icon={<CircleCheck/>} role='status' tone='success'>Аккаунт создан</Banner>
			</Show>
			<div class={css.header}>
				<Typography as='h2' focusOnMount variant='heading-2'>
					{props.newAccount === undefined ? 'Создайте окружение' : 'Создайте своё окружение'}
				</Typography>
				<Typography tone='secondary' variant='body-md'>Общее место для счетов и операций семьи.</Typography>
			</div>
			<Show when={props.newAccount}>
				{(account) => (
					<TextField
						autocomplete='name'
						disabled={props.isSubmitting}
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
			<Show when={props.onBack}>
				{(onBack) => (
					<Button disabled={props.isSubmitting} fullWidth onClick={() => onBack()()} size='lg' variant='ghost'>Назад</Button>
				)}
			</Show>
		</form>
	);
}
