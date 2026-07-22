import css from './contacts.module.scss';

import { Title } from '@solidjs/meta';
import { Archive, Plus, Search, UsersRound } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';

import { ContactCard, ContactIcon } from './ui/contact-card';
import type { ContactDialogMode, ContactDialogValue } from './ui/contact-dialog';
import { ContactDialog } from './ui/contact-dialog';

import type { Contact, ContactTypeFilter } from '~/entities/contact';
import {
    filterContacts,
    getContactMonthlyExpensesById,
    mergeContactsWithImported,
    readContactsFromStorage,
    writeContactsToStorage
} from '~/entities/contact';
import { INITIAL_CONTACTS, INITIAL_OPERATIONS } from '~/entities/operation';
import { cn, CurrencyCode } from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import { Container } from '~/shared/ui/container';
import { createDragAction, DragAction } from '~/shared/ui/drag-action';
import { TextField } from '~/shared/ui/text-field';

type ContactListMode = 'active' | 'archive';

type ContactTypeFilterOption = {
    label: string;
    value: ContactTypeFilter;
};

const CONTACT_TYPE_FILTERS: ContactTypeFilterOption[] = [
    { label: 'Все', value: 'all' },
    { label: 'Люди', value: 'person' },
    { label: 'Компании', value: 'company' }
];

function createContactFromDialogValue(value: ContactDialogValue): Contact {
    const timestamp = new Date().toISOString();

    return {
        ...value,
        createdAt: timestamp,
        id: globalThis.crypto.randomUUID(),
        isArchived: false,
        updatedAt: timestamp
    };
}

function toDialogValue(contact: Contact): ContactDialogValue {
    return {
        color: contact.color,
        legalName: contact.legalName,
        name: contact.name,
        type: contact.type === 'company' ? 'company' : 'person'
    };
}

export function ContactsPage() {
    const [contacts, setContacts] = createSignal<Contact[]>(INITIAL_CONTACTS);
    const [editingContactId, setEditingContactId] = createSignal<string>();
    const [isDialogOpen, setIsDialogOpen] = createSignal(false);
    const [isStorageReady, setIsStorageReady] = createSignal(false);
    const [listMode, setListMode] = createSignal<ContactListMode>('active');
    const [query, setQuery] = createSignal('');
    const [typeFilter, setTypeFilter] = createSignal<ContactTypeFilter>('all');
    const expensesByContactId = getContactMonthlyExpensesById(INITIAL_OPERATIONS, new Date());

    const editingContact = createMemo(() => {
        const contactId = editingContactId();

        return contactId === undefined
            ? undefined
            : contacts().find((contact) => contact.id === contactId);
    });

    const dialogMode = createMemo<ContactDialogMode>(() => (
        editingContact() ? 'edit' : 'create'
    ));

    const dialogInitialValue = createMemo(() => {
        const contact = editingContact();

        return contact ? toDialogValue(contact) : undefined;
    });

    const visibleContacts = createMemo(() => filterContacts(contacts(), {
        archived: listMode() === 'archive',
        query: query(),
        type: typeFilter()
    }));

    const activeCount = createMemo(() => contacts().filter((contact) => !contact.isArchived).length);
    const archivedCount = createMemo(() => contacts().filter((contact) => contact.isArchived).length);

    onMount(() => {
        const storedContacts = readContactsFromStorage(window.localStorage);

        if (storedContacts !== undefined) {
            setContacts(mergeContactsWithImported(storedContacts, INITIAL_CONTACTS));
        }

        setIsStorageReady(true);
    });

    createEffect(() => {
        if (isStorageReady()) {
            writeContactsToStorage(window.localStorage, contacts());
        }
    });

    const handleArchiveContact = (contactId: string) => {
        setContacts((currentContacts) => currentContacts.map((contact) => (
            contact.id === contactId
                ? { ...contact, isArchived: true, updatedAt: new Date().toISOString() }
                : contact
        )));
    };

    const archiveDragAction = createDragAction({
        onDrop: handleArchiveContact
    });

    const handleContactClick = (contactId: string) => {
        if (archiveDragAction.consumeClick(contactId)) {
            return;
        }

        setEditingContactId(contactId);
        setIsDialogOpen(true);
    };

    const handleOpenCreateDialog = () => {
        setEditingContactId(undefined);
        setIsDialogOpen(true);
    };

    const handleDialogOpenChange = (open: boolean) => {
        setIsDialogOpen(open);

        if (!open) {
            setEditingContactId(undefined);
        }
    };

    const handleRestoreContact = () => {
        const contactId = editingContactId();

        if (contactId === undefined) {
            return;
        }

        setContacts((currentContacts) => currentContacts.map((contact) => (
            contact.id === contactId
                ? { ...contact, isArchived: false, updatedAt: new Date().toISOString() }
                : contact
        )));
    };

    const handleContactSubmit = (value: ContactDialogValue) => {
        const contactId = editingContactId();

        if (contactId === undefined) {
            setContacts((currentContacts) => [
                ...currentContacts,
                createContactFromDialogValue(value)
            ]);
            setListMode('active');
            handleDialogOpenChange(false);
            return;
        }

        setContacts((currentContacts) => currentContacts.map((contact) => (
            contact.id === contactId
                ? { ...contact, ...value, updatedAt: new Date().toISOString() }
                : contact
        )));
        handleDialogOpenChange(false);
    };

    const handleQueryInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setQuery(event.currentTarget.value);
    };

    return (
        <>
            <main class={css.root}>
                <Container class={css.page} useMaxSize>
                    <Title>Контакты</Title>
                    <header class={css.header}>
                        <div class={css.headerContent}>
                            <h1 class={css.title}>Контакты</h1>
                            <p class={css.description}>Люди и компании, связанные с операциями семьи</p>
                        </div>
                        <Button
                            aria-label='Добавить контакт'
                            class={css.addButton}
                            iconOnly
                            size='lg'
                            type='button'
                            onClick={handleOpenCreateDialog}
                        >
                            <Plus size={22} strokeWidth={2.5}/>
                        </Button>
                    </header>

                    <section aria-label='Фильтры контактов' class={css.toolbar}>
                        <TextField
                            aria-label='Поиск контактов'
                            class={css.search}
                            placeholder='Название или юридическое имя'
                            startContent={<Search size={17}/>}
                            value={query()}
                            onInput={handleQueryInput}
                        />

                        <div class={css.filterRow}>
                            <div aria-label='Тип контакта' class={css.segmented} role='group'>
                                <For each={CONTACT_TYPE_FILTERS}>
                                    {(option) => (
                                        <button
                                            aria-pressed={typeFilter() === option.value}
                                            class={cn(
                                                css.segment,
                                                typeFilter() === option.value && css.segmentActive
                                            )}
                                            tabIndex={typeFilter() === option.value ? -1 : 0}
                                            type='button'
                                            onClick={() => setTypeFilter(option.value)}
                                        >
                                            {option.label}
                                        </button>
                                    )}
                                </For>
                            </div>

                            <div aria-label='Состояние контактов' class={css.segmented} role='group'>
                                <button
                                    aria-pressed={listMode() === 'active'}
                                    class={cn(css.segment, listMode() === 'active' && css.segmentActive)}
                                    tabIndex={listMode() === 'active' ? -1 : 0}
                                    type='button'
                                    onClick={() => setListMode('active')}
                                >
                                    <UsersRound size={16}/>
                                    Активные <span class={css.count}>{activeCount()}</span>
                                </button>
                                <button
                                    aria-pressed={listMode() === 'archive'}
                                    class={cn(css.segment, listMode() === 'archive' && css.segmentActive)}
                                    tabIndex={listMode() === 'archive' ? -1 : 0}
                                    type='button'
                                    onClick={() => setListMode('archive')}
                                >
                                    <Archive size={16}/>
                                    Архив <span class={css.count}>{archivedCount()}</span>
                                </button>
                            </div>
                        </div>
                    </section>

                    <Show
                        fallback={(
                            <div class={css.emptyState}>
                                <strong>{listMode() === 'archive' ? 'Архив пуст' : 'Контакты не найдены'}</strong>
                                <span>
                                    {query() || typeFilter() !== 'all'
                                        ? 'Измените параметры поиска или фильтра'
                                        : 'Добавьте первый контакт вручную'}
                                </span>
                                <Show when={listMode() === 'active' && !query() && typeFilter() === 'all'}>
                                    <Button type='button' onClick={handleOpenCreateDialog}>Добавить контакт</Button>
                                </Show>
                            </div>
                        )}
                        when={visibleContacts().length > 0}
                    >
                        <div class={css.grid}>
                            <For each={visibleContacts()}>
                                {(contact) => {
                                    const isDraggable = () => !contact.isArchived;

                                    return (
                                        <ContactCard
                                            contact={contact}
                                            currency={CurrencyCode.BYN}
                                            draggable={isDraggable()}
                                            isDragging={archiveDragAction.activeId() === contact.id}
                                            spentMinor={expensesByContactId.get(contact.id) ?? 0}
                                            onClick={() => handleContactClick(contact.id)}
                                            onPointerCancel={isDraggable()
                                                ? archiveDragAction.onPointerCancel
                                                : undefined}
                                            onPointerDown={isDraggable()
                                                ? (event) => archiveDragAction.onPointerDown(contact.id, event)
                                                : undefined}
                                            onPointerMove={isDraggable()
                                                ? archiveDragAction.onPointerMove
                                                : undefined}
                                            onPointerUp={isDraggable()
                                                ? archiveDragAction.onPointerUp
                                                : undefined}
                                        />
                                    );
                                }}
                            </For>
                        </div>
                    </Show>
                </Container>
            </main>

            <DragAction.Overlay
                controller={archiveDragAction}
                icon={<Archive size={30} strokeWidth={2.2}/>}
                label='Отправить контакт в архив'
                tone='neutral'
            >
                {(contactId) => {
                    const contact = contacts().find((item) => item.id === contactId);

                    return contact ? (
                        <DragAction.Preview
                            accentColor={contact.color}
                            description={contact.type === 'company' ? 'Компания' : 'Контакт'}
                            icon={<ContactIcon type={contact.type}/>}
                            title={contact.name}
                        />
                    ) : null;
                }}
            </DragAction.Overlay>

            <ContactDialog
                initialValue={dialogInitialValue()}
                isArchived={editingContact()?.isArchived}
                mode={dialogMode()}
                open={isDialogOpen()}
                onOpenChange={handleDialogOpenChange}
                onRestore={editingContact()?.isArchived ? handleRestoreContact : undefined}
                onSubmit={handleContactSubmit}
            />
        </>
    );
}
