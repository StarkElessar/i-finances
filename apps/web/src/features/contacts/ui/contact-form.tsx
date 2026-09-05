import {
	contactTypeLabels,
	readContactFields,
	toContactFormFields
} from '@/features/contacts/model';

import type {
	ContactType,
	CreateContactInput,
	PersistedContact
} from '@i-finances/contracts';
import { createEffect, createSignal, Show } from 'solid-js';

export type ContactFormProps = {
	contact: PersistedContact | undefined;
	error: string | undefined;
	fieldErrors: Record<string, string> | undefined;
	onArchive: () => Promise<void>;
	onCancel: () => void;
	onRestore: () => Promise<void>;
	onSubmit: (fields: CreateContactInput) => Promise<void>;
	pending: boolean;
};

export function ContactForm(props: ContactFormProps) {
	const [color, setColor] = createSignal('#2563eb');
	const [legalName, setLegalName] = createSignal('');
	const [name, setName] = createSignal('');
	const [type, setType] = createSignal<Exclude<ContactType, 'unknown'>>('person');
	const [formError, setFormError] = createSignal<string>();

	createEffect(() => {
		const contact = props.contact;
		const fields = contact === undefined ? undefined : toContactFormFields(contact);

		setColor(fields?.color ?? '#2563eb');
		setLegalName(fields?.legalName ?? '');
		setName(fields?.name ?? '');
		setType(fields?.type ?? 'person');
		setFormError(undefined);
	});

	const isArchived = () => props.contact !== undefined && props.contact.archivedAt !== null;

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setFormError(undefined);

		const fields = readContactFields(new FormData(event.currentTarget));

		if (fields === undefined) {
			setFormError('Проверьте название, тип и цвет контакта.');
			return;
		}

		await props.onSubmit(fields);
	};

	const handleTypeChange = (event: Event & { currentTarget: HTMLSelectElement }) => {
		setType(event.currentTarget.value === 'company' ? 'company' : 'person');
	};

	return (
		<form class='contact-form' onSubmit={handleSubmit}>
			<div class='section-heading'>
				<div>
					<h3>{props.contact === undefined ? 'Новый контакт' : 'Изменить контакт'}</h3>
					<Show when={props.contact}>
						{(contact) => <small>Версия {contact().version}</small>}
					</Show>
				</div>
				<Show when={props.contact !== undefined}>
					<button class='link-button' onClick={props.onCancel} type='button'>Отмена</button>
				</Show>
			</div>

			<label>
				<span>Название</span>
				<input
					maxlength='120'
					name='name'
					onInput={(event) => setName(event.currentTarget.value)}
					required
					value={name()}
				/>
				<Show when={props.fieldErrors?.name}>
					{(message) => <small class='contact-field-error'>{message()}</small>}
				</Show>
			</label>
			<label>
				<span>Тип</span>
				<select
					name='type'
					onChange={handleTypeChange}
					value={type()}
				>
					<option value='person'>{contactTypeLabels.person}</option>
					<option value='company'>{contactTypeLabels.company}</option>
				</select>
			</label>
			<Show when={type() === 'company'}>
				<label>
					<span>Юридическое название</span>
					<input
						maxlength='180'
						name='legalName'
						onInput={(event) => setLegalName(event.currentTarget.value)}
						value={legalName()}
					/>
					<Show when={props.fieldErrors?.legalName}>
						{(message) => <small class='contact-field-error'>{message()}</small>}
					</Show>
				</label>
			</Show>
			<label class='color-field'>
				<span>Цвет</span>
				<input name='color' onInput={(event) => setColor(event.currentTarget.value)} type='color' value={color()}/>
				<Show when={props.fieldErrors?.color}>
					{(message) => <small class='contact-field-error'>{message()}</small>}
				</Show>
			</label>

			<Show when={formError() ?? props.error}>
				{(error) => <p class='contact-error' role='alert'>{error()}</p>}
			</Show>

			<div class='contact-form-actions'>
				<button disabled={props.pending} type='submit'>
					{props.pending ? 'Сохраняем…' : props.contact === undefined ? 'Создать контакт' : 'Сохранить контакт'}
				</button>
				<Show when={props.contact !== undefined}>
					<button
						class='secondary-button'
						disabled={props.pending}
						onClick={isArchived() ? props.onRestore : props.onArchive}
						type='button'
					>
						{isArchived() ? 'Восстановить' : 'В архив'}
					</button>
				</Show>
			</div>
		</form>
	);
}
