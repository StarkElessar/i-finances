import { contactTypeLabels } from '@/features/contacts/model';

import type { ContactCollection, PersistedContact } from '@i-finances/contracts';
import { For, Show } from 'solid-js';

export type ContactListProps = {
	collection: ContactCollection;
	onArchive: (contact: PersistedContact) => Promise<void>;
	onEdit: (contact: PersistedContact) => void;
	pending: boolean;
};

export function ContactList(props: ContactListProps) {
	return (
		<Show
			when={props.collection.items.length > 0}
			fallback={<p>Контактов пока нет.</p>}
		>
			<ul class='contact-list'>
				<For each={props.collection.items}>
					{(contact) => (
						<li class='contact-item'>
							<span
								aria-hidden='true'
								class='contact-color'
								style={{ 'background-color': contact.color }}
							/>
							<div class='contact-item-content'>
								<strong>{contact.name}</strong>
								<small>
									{contactTypeLabels[contact.type]}
									{contact.legalName === null ? '' : ` · ${contact.legalName}`}
									{contact.archivedAt === null ? '' : ' · Архив'}
								</small>
							</div>
							<div class='contact-item-actions'>
								<button
									class='secondary-button'
									disabled={props.pending}
									onClick={() => props.onEdit(contact)}
									type='button'
								>
									Изменить
								</button>
								<button
									class='secondary-button'
									disabled={props.pending}
									onClick={() => props.onArchive(contact)}
									type='button'
								>
									{contact.archivedAt === null ? 'В архив' : 'Восстановить'}
								</button>
							</div>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
