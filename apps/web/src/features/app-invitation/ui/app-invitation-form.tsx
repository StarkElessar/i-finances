import css from './app-invitation-dialog.module.scss';

import { TextField, Typography } from '@/shared/ui';

import { APP_INVITATION_NOTE_MAX_LENGTH } from '@i-finances/contracts';
import { createUniqueId, onMount } from 'solid-js';

export type AppInvitationFormProps = {
	id: string;
	note: string;
	error?: string;
	loading: boolean;
	onNoteInput: (note: string) => void;
	onCreate: () => void;
};

export function AppInvitationForm(props: AppInvitationFormProps) {
	const countId = createUniqueId();
	let input: HTMLInputElement | undefined;

	onMount(() => input?.focus());

	return (
		<form
			class={css.section}
			id={props.id}
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				props.onCreate();
			}}
		>
			<TextField
				aria-describedby={countId}
				autocomplete='off'
				disabled={props.loading}
				error={props.error}
				hint='Заметка видна только администратору'
				label='Для кого'
				name='app-invitation-note'
				onInput={(event) => props.onNoteInput(event.currentTarget.value)}
				optional
				ref={input}
				value={props.note}
			/>
			<Typography align='end' id={countId} tone={props.error ? 'danger' : 'secondary'} variant='caption'>
				{props.note.length} / {APP_INVITATION_NOTE_MAX_LENGTH}
			</Typography>
		</form>
	);
}
