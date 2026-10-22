import css from './onboarding-card.module.scss';

import { Banner, Button, ChoiceCard, ChoiceCardGroup, TextField, Typography } from '@/shared/ui';

import { CircleAlert, Link, Plus } from 'lucide-solid';
import { Show } from 'solid-js';

import type { WelcomeChoice } from '../model/read-welcome-form';

export type OnboardingWelcomeCardProps = {
	displayName: string;
	displayNameError?: string;
	onDisplayNameInput: (value: string) => void;
	choice: WelcomeChoice;
	onChoice: (choice: WelcomeChoice) => void;
	link: string;
	linkError?: string;
	onLinkInput: (value: string) => void;
	/** «Вы больше не участник окружения «Семья»» (card 6): the household the person was removed from. */
	lostHouseholdName?: string;
	/** The name could not be saved; the message sits in a banner. */
	error?: string;
	canContinue: boolean;
	isSubmitting?: boolean;
	onContinue: () => void;
	/** A way out for a wrong account; the board has none, the page would otherwise be a dead end. */
	onSignOut: () => void;
};

/**
 * Cards 1, 2, 3 and 6 of `Flow-Onboarding`: «Добро пожаловать», the name to confirm and the choice between «Создать
 * своё окружение» and «У меня есть приглашение» (with the field for the link).
 */
export function OnboardingWelcomeCard(props: OnboardingWelcomeCardProps) {
	return (
		<form
			class={css.form}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();

				if (props.canContinue && !props.isSubmitting) {
					props.onContinue();
				}
			}}
		>
			<Show when={props.lostHouseholdName}>
				{(name) => (
					<Banner icon={<CircleAlert/>} role='status' tone='warning'>
						Вы больше не участник окружения «{name()}». Создайте своё или примите новое приглашение.
					</Banner>
				)}
			</Show>
			<div class={css.header}>
				<Typography as='h2' focusOnMount variant='heading-2'>Добро пожаловать</Typography>
			</div>
			<TextField
				autocomplete='name'
				disabled={props.isSubmitting}
				error={props.displayNameError}
				hint='Так вас увидят участники окружения. Можно изменить'
				label='Ваше имя'
				maxLength={100}
				name='display-name'
				onInput={(event) => props.onDisplayNameInput(event.currentTarget.value)}
				placeholder='Как к вам обращаться'
				required
				value={props.displayName}
			/>
			<ChoiceCardGroup legend='Что вы хотите сделать'>
				<ChoiceCard
					checked={props.choice === 'create'}
					description='Для вас и семьи, приглашения потом'
					disabled={props.isSubmitting}
					icon={<Plus/>}
					name='onboarding-choice'
					onChange={() => props.onChoice('create')}
					title='Создать своё окружение'
					value='create'
				/>
				<ChoiceCard
					checked={props.choice === 'invite'}
					description='Присоединиться к окружению близких'
					disabled={props.isSubmitting}
					icon={<Plus/>}
					name='onboarding-choice'
					onChange={() => props.onChoice('invite')}
					title='У меня есть приглашение'
					value='invite'
				/>
			</ChoiceCardGroup>
			<Show when={props.choice === 'invite'}>
				<TextField
					autocomplete='off'
					disabled={props.isSubmitting}
					error={props.linkError}
					hint={props.linkError ? undefined : 'Вставьте ссылку, которую вам прислали'}
					label='Ссылка-приглашение'
					name='invitation-link'
					onInput={(event) => props.onLinkInput(event.currentTarget.value)}
					placeholder='https://…/invite#…'
					spellcheck={false}
					startContent={<Link/>}
					value={props.link}
				/>
			</Show>
			<Show when={props.error}>
				{(message) => <Banner icon={<CircleAlert/>} role='alert' tone='danger'>{message()}</Banner>}
			</Show>
			<Button disabled={!props.canContinue} fullWidth loading={props.isSubmitting} size='lg' type='submit'>Продолжить</Button>
			<Button disabled={props.isSubmitting} fullWidth onClick={() => props.onSignOut()} size='lg' variant='ghost'>Выйти</Button>
		</form>
	);
}
