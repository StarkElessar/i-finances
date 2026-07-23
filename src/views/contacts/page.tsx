import css from './contacts.module.scss';

import { Title } from '@solidjs/meta';
import {
    createAsync,
    revalidate,
    useAction,
    useSubmission
} from '@solidjs/router';
import {
    Archive,
    Plus,
    RefreshCw,
    Search,
    UsersRound
} from 'lucide-solid';
import type { Accessor } from 'solid-js';
import {
    createMemo,
    createSignal,
    ErrorBoundary,
    For,
    Show
} from 'solid-js';

import { ContactCard, ContactIcon } from './ui/contact-card';
import type { ContactDialogMode, ContactDialogValue } from './ui/contact-dialog';
import { ContactDialog } from './ui/contact-dialog';

import type {
    ContactCollection,
    ContactTypeFilter,
    PersistedContact
} from '~/entities/contact';
import {
    archiveContact as archiveContactAction,
    createContact as createContactAction,
    filterContacts,
    getContacts,
    restoreContact as restoreContactAction,
    updateContact as updateContactAction
} from '~/entities/contact';
import type { MonthlyExpenseSummary } from '~/entities/operation';
import {
    formatLocalDateKey,
    getMonthlyExpenseSummary
} from '~/entities/operation';
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

type ContactsContentProps = {
    collection: Accessor<ContactCollection | undefined>;
    monthlySummary: Accessor<MonthlyExpenseSummary | undefined>;
};

function getCurrentMonthKey(): string {
    return formatLocalDateKey(new Date()).slice(0, 7);
}

const CONTACT_TYPE_FILTERS: ContactTypeFilterOption[] = [
    { label: 'Все', value: 'all' },
    { label: 'Люди', value: 'person' },
    { label: 'Компании', value: 'company' }
];

function toDialogValue(contact: PersistedContact): ContactDialogValue {
    return {
        color: contact.color,
        legalName: contact.legalName,
        name: contact.name,
        type: contact.type === 'company' ? 'company' : 'person'
    };
}

function ContactsGridSkeleton() {
    return (
        <div aria-label='Загрузка контактов' class={css.grid} role='status'>
            <For each={Array.from({ length: 6 })}>
                {() => <div class={css.skeletonCard}/>}
            </For>
        </div>
    );
}

type ContactsLoadErrorProps = {
    onRetry: () => void;
};

function ContactsLoadError(props: ContactsLoadErrorProps) {
    return (
        <main class={css.root}>
            <Container class={css.page}>
                <div class={css.loadError}>
                    <div>
                        <h1>Не удалось загрузить контакты</h1>
                        <p>Проверьте подключение и повторите попытку.</p>
                    </div>
                    <Button
                        startIcon={<RefreshCw size={18}/>}
                        type='button'
                        variant='secondary'
                        onClick={props.onRetry}
                    >
                        Повторить
                    </Button>
                </div>
            </Container>
        </main>
    );
}

function ContactsContent(props: ContactsContentProps) {
    const [editingContactId, setEditingContactId] = createSignal<string>();
    const [isDialogOpen, setIsDialogOpen] = createSignal(false);
    const [listMode, setListMode] = createSignal<ContactListMode>('active');
    const [query, setQuery] = createSignal('');
    const [typeFilter, setTypeFilter] = createSignal<ContactTypeFilter>('all');
    const [dialogError, setDialogError] = createSignal<string>();
    const [dialogFieldErrors, setDialogFieldErrors]
        = createSignal<Record<string, string>>();
    const [pageError, setPageError] = createSignal<string>();
    const runArchiveContact = useAction(archiveContactAction);
    const runCreateContact = useAction(createContactAction);
    const runRestoreContact = useAction(restoreContactAction);
    const runUpdateContact = useAction(updateContactAction);
    const archiveSubmission = useSubmission(archiveContactAction);
    const createSubmission = useSubmission(createContactAction);
    const restoreSubmission = useSubmission(restoreContactAction);
    const updateSubmission = useSubmission(updateContactAction);

    const contacts = () => props.collection()?.items ?? [];
    const currency = () => (
        props.monthlySummary()?.baseCurrency
        ?? props.collection()?.baseCurrency
        ?? CurrencyCode.BYN
    );
    const isLoaded = () => (
        props.collection() !== undefined
        && props.monthlySummary() !== undefined
    );
    const isLoading = () => !isLoaded();
    const contactExpenses = () => (
        props.monthlySummary()?.contactExpensesMinor ?? {}
    );
    const isDialogMutationPending = () => Boolean(
        createSubmission.pending || updateSubmission.pending
    );
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
    const activeCount = createMemo(() => (
        contacts().filter((contact) => contact.archivedAt === null).length
    ));
    const archivedCount = createMemo(() => (
        contacts().filter((contact) => contact.archivedAt !== null).length
    ));

    const resetDialogErrors = () => {
        setDialogError(undefined);
        setDialogFieldErrors(undefined);
    };

    const handleOpenCreateDialog = () => {
        setEditingContactId(undefined);
        resetDialogErrors();
        setIsDialogOpen(true);
    };

    const handleOpenEditDialog = (contactId: string) => {
        setEditingContactId(contactId);
        resetDialogErrors();
        setIsDialogOpen(true);
    };

    const handleArchiveContact = async (contactId: string) => {
        const contact = contacts().find((item) => item.id === contactId);

        if (contact === undefined || contact.archivedAt !== null) {
            return;
        }

        setPageError(undefined);

        try {
            const result = await runArchiveContact({
                id: contact.id,
                version: contact.version
            });

            if (!result.ok) {
                setPageError(result.message);
            }
        }
        catch {
            setPageError(
                'Не удалось отправить контакт в архив. Повторите попытку.'
            );
        }
    };

    const archiveDragAction = createDragAction({
        onDrop: (contactId) => {
            void handleArchiveContact(contactId);
        }
    });

    const handleContactClick = (contactId: string) => {
        if (archiveDragAction.consumeClick(contactId)) {
            return;
        }

        handleOpenEditDialog(contactId);
    };

    const handleDialogOpenChange = (open: boolean) => {
        if (isDialogMutationPending() || restoreSubmission.pending) {
            return;
        }

        setIsDialogOpen(open);

        if (!open) {
            setEditingContactId(undefined);
            resetDialogErrors();
        }
    };

    const handleContactSubmit = async (value: ContactDialogValue) => {
        const contact = editingContact();

        resetDialogErrors();

        try {
            const result = contact
                ? await runUpdateContact({
                    ...value,
                    id: contact.id,
                    version: contact.version
                })
                : await runCreateContact(value);

            if (result.ok) {
                setListMode('active');
                setIsDialogOpen(false);
                setEditingContactId(undefined);
                return;
            }

            setDialogError(result.message);
            setDialogFieldErrors(result.fieldErrors);
        }
        catch {
            setDialogError(
                'Не удалось сохранить контакт. Проверьте подключение и повторите попытку.'
            );
        }
    };

    const handleRestoreContact = async () => {
        const contact = editingContact();

        if (contact === undefined || contact.archivedAt === null) {
            return;
        }

        resetDialogErrors();

        try {
            const result = await runRestoreContact({
                id: contact.id,
                version: contact.version
            });

            if (result.ok) {
                setListMode('active');
                setIsDialogOpen(false);
                setEditingContactId(undefined);
                return;
            }

            setDialogError(result.message);
            setDialogFieldErrors(result.fieldErrors);
        }
        catch {
            setDialogError(
                'Не удалось восстановить контакт. Повторите попытку.'
            );
        }
    };

    const handleQueryInput = (
        event: InputEvent & { currentTarget: HTMLInputElement }
    ) => {
        setQuery(event.currentTarget.value);
    };

    return (
        <>
            <main class={css.root}>
                <Container class={css.page}>
                    <Title>Контакты</Title>
                    <header class={css.header}>
                        <div class={css.headerContent}>
                            <h1 class={css.title}>Контакты</h1>
                            <p class={css.description}>
                                Люди и компании, связанные с операциями семьи
                            </p>
                        </div>
                        <Button
                            aria-label='Добавить контакт'
                            class={css.addButton}
                            disabled={isLoading()}
                            iconOnly
                            size='lg'
                            type='button'
                            onClick={handleOpenCreateDialog}
                        >
                            <Plus size={22} strokeWidth={2.5}/>
                        </Button>
                    </header>

                    <Show when={isLoaded()}>
                        <section
                            aria-label='Фильтры контактов'
                            class={css.toolbar}
                        >
                            <TextField
                                aria-label='Поиск контактов'
                                class={css.search}
                                placeholder='Название или юридическое имя'
                                startContent={<Search size={17}/>}
                                value={query()}
                                onInput={handleQueryInput}
                            />

                            <div class={css.filterRow}>
                                <div
                                    aria-label='Тип контакта'
                                    class={css.segmented}
                                    role='group'
                                >
                                    <For each={CONTACT_TYPE_FILTERS}>
                                        {(option) => (
                                            <button
                                                aria-pressed={
                                                    typeFilter() === option.value
                                                }
                                                class={cn(
                                                    css.segment,
                                                    typeFilter() === option.value
                                                        && css.segmentActive
                                                )}
                                                tabIndex={
                                                    typeFilter() === option.value
                                                        ? -1
                                                        : 0
                                                }
                                                type='button'
                                                onClick={() => (
                                                    setTypeFilter(option.value)
                                                )}
                                            >
                                                {option.label}
                                            </button>
                                        )}
                                    </For>
                                </div>

                                <div
                                    aria-label='Состояние контактов'
                                    class={css.segmented}
                                    role='group'
                                >
                                    <button
                                        aria-pressed={listMode() === 'active'}
                                        class={cn(
                                            css.segment,
                                            listMode() === 'active'
                                                && css.segmentActive
                                        )}
                                        tabIndex={
                                            listMode() === 'active' ? -1 : 0
                                        }
                                        type='button'
                                        onClick={() => setListMode('active')}
                                    >
                                        <UsersRound size={16}/>
                                        Активные
                                        <span class={css.count}>
                                            {activeCount()}
                                        </span>
                                    </button>
                                    <button
                                        aria-pressed={listMode() === 'archive'}
                                        class={cn(
                                            css.segment,
                                            listMode() === 'archive'
                                                && css.segmentActive
                                        )}
                                        tabIndex={
                                            listMode() === 'archive' ? -1 : 0
                                        }
                                        type='button'
                                        onClick={() => setListMode('archive')}
                                    >
                                        <Archive size={16}/>
                                        Архив
                                        <span class={css.count}>
                                            {archivedCount()}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </section>
                    </Show>

                    <Show when={pageError()}>
                        <p class={css.pageError} role='alert'>{pageError()}</p>
                    </Show>

                    <Show fallback={<ContactsGridSkeleton/>} when={isLoaded()}>
                        <Show
                            fallback={(
                                <div class={css.emptyState}>
                                    <strong>
                                        {listMode() === 'archive'
                                            ? 'Архив пуст'
                                            : 'Контакты не найдены'}
                                    </strong>
                                    <span>
                                        {query() || typeFilter() !== 'all'
                                            ? 'Измените параметры поиска или фильтра'
                                            : 'Добавьте первый контакт вручную'}
                                    </span>
                                    <Show
                                        when={
                                            listMode() === 'active'
                                            && !query()
                                            && typeFilter() === 'all'
                                        }
                                    >
                                        <Button
                                            type='button'
                                            onClick={handleOpenCreateDialog}
                                        >
                                            Добавить контакт
                                        </Button>
                                    </Show>
                                </div>
                            )}
                            when={visibleContacts().length > 0}
                        >
                            <div class={css.grid}>
                                <For each={visibleContacts()}>
                                    {(contact) => {
                                        const isDraggable = () => (
                                            contact.archivedAt === null
                                            && !archiveSubmission.pending
                                        );

                                        return (
                                            <ContactCard
                                                contact={contact}
                                                currency={currency()}
                                                draggable={isDraggable()}
                                                isDragging={
                                                    archiveDragAction.activeId()
                                                    === contact.id
                                                }
                                                spentMinor={
                                                    contactExpenses()[contact.id]
                                                    ?? 0
                                                }
                                                onClick={() => (
                                                    handleContactClick(contact.id)
                                                )}
                                                onPointerCancel={isDraggable()
                                                    ? archiveDragAction.onPointerCancel
                                                    : undefined}
                                                onPointerDown={isDraggable()
                                                    ? (event) => (
                                                        archiveDragAction.onPointerDown(
                                                            contact.id,
                                                            event
                                                        )
                                                    )
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
                    const contact = contacts().find(
                        (item) => item.id === contactId
                    );

                    return contact ? (
                        <DragAction.Preview
                            accentColor={contact.color}
                            description={
                                contact.type === 'company'
                                    ? 'Компания'
                                    : 'Контакт'
                            }
                            icon={<ContactIcon type={contact.type}/>}
                            title={contact.name}
                        />
                    ) : null;
                }}
            </DragAction.Overlay>

            <ContactDialog
                currency={currency()}
                error={dialogError()}
                fieldErrors={dialogFieldErrors()}
                initialValue={dialogInitialValue()}
                isArchived={Boolean(editingContact()?.archivedAt)}
                loading={isDialogMutationPending()}
                mode={dialogMode()}
                open={isDialogOpen()}
                restoreLoading={restoreSubmission.pending}
                onOpenChange={handleDialogOpenChange}
                onRestore={editingContact()?.archivedAt
                    ? handleRestoreContact
                    : undefined}
                onSubmit={handleContactSubmit}
            />
        </>
    );
}

export function ContactsPage() {
    const collection = createAsync(() => getContacts({ status: 'all' }));
    const monthlySummary = createAsync(() => getMonthlyExpenseSummary({
        month: getCurrentMonthKey()
    }));

    return (
        <ErrorBoundary
            fallback={(_error, reset) => (
                <ContactsLoadError
                    onRetry={() => {
                        void Promise.all([
                            revalidate(getContacts.key, true),
                            revalidate(getMonthlyExpenseSummary.key, true)
                        ]).then(reset, reset);
                    }}
                />
            )}
        >
            <ContactsContent
                collection={collection}
                monthlySummary={monthlySummary}
            />
        </ErrorBoundary>
    );
}
