import type { ContactClient } from '@/features/contacts/api';
import { resolveContactError } from '@/features/contacts/lib';
import { updateContact } from '@/features/contacts/model';

import type {
	ContactCollection,
	CreateContactInput,
	PersistedContact
} from '@i-finances/contracts';
import { createResource, createSignal, Show } from 'solid-js';

import { ContactForm } from './contact-form';
import { ContactList } from './contact-list';

export type ContactsViewProps = {
	client: ContactClient;
};

export function ContactsView(props: ContactsViewProps) {
	const [includeArchived, setIncludeArchived] = createSignal(false);
	const [contacts, { refetch }] = createResource<ContactCollection>(
		() => props.client.list(includeArchived() ? 'all' : 'active')
	);
	const [editingContact, setEditingContact] = createSignal<PersistedContact>();
	const [message, setMessage] = createSignal<string>();
	const [error, setError] = createSignal<string>();
	const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>();
	const [pending, setPending] = createSignal(false);

	const resetFeedback = () => {
		setMessage(undefined);
		setError(undefined);
		setFieldErrors(undefined);
	};

	const handleEdit = (contact: PersistedContact) => {
		resetFeedback();
		setEditingContact(contact);
	};

	const handleNew = () => {
		resetFeedback();
		setEditingContact(undefined);
	};

	const handleSubmit = async (fields: CreateContactInput) => {
		resetFeedback();
		setPending(true);

		try {
			const contact = editingContact();
			const result = contact === undefined
				? await props.client.create(fields)
				: await updateContact(props.client, contact, fields);

			if (!result.ok) {
				setError(result.message);
				setFieldErrors(result.fieldErrors);
				return;
			}

			setMessage(contact === undefined ? 'Контакт создан.' : 'Контакт обновлён.');
			setEditingContact(undefined);
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveContactError(caughtError));
		}
		finally {
			setPending(false);
		}
	};

	const handleArchive = async (contact: PersistedContact) => {
		resetFeedback();
		setPending(true);

		try {
			const result = contact.archivedAt === null
				? await props.client.archive({ id: contact.id, version: contact.version })
				: await props.client.restore({ id: contact.id, version: contact.version });

			if (!result.ok) {
				setError(result.message);
				setFieldErrors(result.fieldErrors);
				return;
			}

			setMessage(contact.archivedAt === null ? 'Контакт архивирован.' : 'Контакт восстановлен.');
			setEditingContact(undefined);
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveContactError(caughtError));
		}
		finally {
			setPending(false);
		}
	};

	const handleEditingArchive = () => {
		const contact = editingContact();

		return contact === undefined ? Promise.resolve() : handleArchive(contact);
	};

	return (
		<section aria-labelledby='contacts-title' class='contacts-panel'>
			<div class='section-heading'>
				<div>
					<p class='eyebrow'>Следующий web-срез</p>
					<h2 id='contacts-title'>Контакты</h2>
				</div>
				<div class='contact-heading-actions'>
					<label class='toggle-label'>
						<input
							checked={includeArchived()}
							onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
							type='checkbox'
						/>
						Показывать архив
					</label>
					<button class='secondary-button' onClick={handleNew} type='button'>Новый контакт</button>
				</div>
			</div>

			<Show when={message()}>
				{(currentMessage) => <p class='contact-success' role='status'>{currentMessage()}</p>}
			</Show>
			<Show when={error() && editingContact() === undefined}>
				{(currentError) => <p class='contact-error' role='alert'>{currentError()}</p>}
			</Show>

			<Show when={!contacts.loading} fallback={<p role='status'>Загрузка контактов…</p>}>
				<Show when={contacts()} fallback={<p role='alert'>Не удалось загрузить контакты.</p>}>
					{(collection) => (
						<ContactList collection={collection()} onArchive={handleArchive} onEdit={handleEdit} pending={pending()}/>
					)}
				</Show>
			</Show>

			<ContactForm
				contact={editingContact()}
				error={error()}
				fieldErrors={fieldErrors()}
				onArchive={handleEditingArchive}
				onCancel={handleNew}
				onRestore={handleEditingArchive}
				onSubmit={handleSubmit}
				pending={pending()}
			/>
		</section>
	);
}
