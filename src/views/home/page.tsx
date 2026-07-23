import css from './home.module.scss';

import { Title } from '@solidjs/meta';
import {
    createAsync,
    revalidate,
    useAction,
    useSubmission
} from '@solidjs/router';
import {
    CircleAlert,
    Pencil,
    Plus,
    RefreshCw,
    WalletCards
} from 'lucide-solid';
import type { Accessor, JSX } from 'solid-js';
import {
    createEffect,
    createMemo,
    createSignal,
    ErrorBoundary,
    For,
    onCleanup,
    onMount,
    Show
} from 'solid-js';

import type { AccountDialogValue } from './ui/account-dialog';
import { AccountDialog } from './ui/account-dialog';
import type { OperationDetailsPanelMode } from './ui/operation-details-panel';
import { OperationDetailsPanel } from './ui/operation-details-panel';
import { OperationsTable } from './ui/operations-table';

import type { Account, PersistedAccount } from '~/entities/account';
import {
    createAccount as createAccountAction,
    getAccounts,
    updateAccount as updateAccountAction
} from '~/entities/account/api';
import type { Category } from '~/entities/category';
import { INITIAL_CATEGORIES, readCategoriesFromStorage } from '~/entities/category';
import type { Contact } from '~/entities/contact';
import {
    mergeContactsWithImported,
    readContactsFromStorage
} from '~/entities/contact';
import type {
    Operation,
    OperationFormValue,
    OperationWithBalance
} from '~/entities/operation';
import {
    createOperation,
    getAccountBalanceMinor,
    INITIAL_CONTACTS,
    INITIAL_OPERATIONS,
    readOperationsFromStorage,
    softDeleteOperation,
    updateOperation,
    writeOperationsToStorage
} from '~/entities/operation';
import type { CurrencyCodeValue, CurrencyExchangeRates } from '~/shared/lib';
import {
    amountToMinorUnits,
    cn,
    convertCurrency,
    CurrencyCode,
    formatCurrency,
    formatDate,
    getAccountTypeMeta,
    minorUnitsToAmount,
    sumMoney
} from '~/shared/lib';
import { AccountIcon, Button, Container } from '~/shared/ui';

const FAMILY_TOTAL_CURRENCY = CurrencyCode.BYN;
const DESKTOP_DETAILS_QUERY = '(min-width: 60.0625em)';

const FAMILY_TOTAL_EXCHANGE_RATES = {
    baseCurrency: CurrencyCode.BYN,
    ratesToBaseCurrency: {
        [CurrencyCode.USD]: 3.25,
        [CurrencyCode.EUR]: 3.75
    }
} satisfies CurrencyExchangeRates;

const ACCOUNT_CURRENCY_OPTIONS = CurrencyCode.values();

function getAccountItemStyle(account: Account): JSX.CSSProperties {
    return {
        '--account-color': account.color
    };
}

function formatExchangeRateLabel(currency: CurrencyCodeValue): string {
    const convertedAmount = convertCurrency(1, currency, FAMILY_TOTAL_CURRENCY, FAMILY_TOTAL_EXCHANGE_RATES);

    return `1 ${currency} = ${formatCurrency(convertedAmount, FAMILY_TOTAL_CURRENCY)}`;
}

function getDefaultTransactionExchangeRate(currency: CurrencyCodeValue): string {
    if (currency === FAMILY_TOTAL_CURRENCY) {
        return '1';
    }

    const rate = FAMILY_TOTAL_EXCHANGE_RATES.ratesToBaseCurrency[currency];

    if (!rate) {
        throw new Error(`Missing exchange rate for ${currency}`);
    }

    return String(rate);
}

function createOperationId(): string {
    return `operation-${globalThis.crypto.randomUUID()}`;
}

function toAccountDialogValue(account: PersistedAccount): AccountDialogValue {
    return {
        balance: minorUnitsToAmount(account.initialBalanceMinor),
        color: account.color,
        currency: account.currency,
        isColorAccentEnabled: account.isColorAccentEnabled,
        isIncludedInFamilyTotal: account.isIncludedInFamilyTotal,
        name: account.name,
        type: account.type
    };
}

function AccountListSkeleton() {
    return (
        <div aria-label='Загрузка счетов' class={css.accountListSkeleton} role='status'>
            <For each={[0, 1, 2, 3]}>
                {() => (
                    <div class={css.accountSkeletonItem}>
                        <span class={css.accountSkeletonIcon}/>
                        <span class={css.accountSkeletonContent}>
                            <span class={css.accountSkeletonTitle}/>
                            <span class={css.accountSkeletonMeta}/>
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
}

function AccountWorkspaceSkeleton() {
    return (
        <section aria-label='Загрузка операций' class={css.workspaceSkeleton} role='status'>
            <div class={css.workspaceSkeletonHeader}>
                <span class={css.workspaceSkeletonIcon}/>
                <span class={css.workspaceSkeletonHeading}>
                    <span/>
                    <span/>
                </span>
                <span class={css.workspaceSkeletonBalance}/>
            </div>
            <div class={css.workspaceSkeletonTable}>
                <span/>
                <span/>
                <span/>
                <span/>
                <span/>
            </div>
        </section>
    );
}

type AccountsEmptyStateProps = {
    onCreate: () => void;
};

function AccountsEmptyState(props: AccountsEmptyStateProps) {
    return (
        <section class={css.accountsEmpty}>
            <WalletCards aria-hidden='true' size={38} strokeWidth={1.8}/>
            <div class={css.accountsEmptyContent}>
                <h1>Счетов пока нет</h1>
                <p>Создайте первый счет, чтобы начать вести операции и считать общий баланс.</p>
            </div>
            <Button startIcon={<Plus size={18}/>} type='button' onClick={props.onCreate}>
                Создать счет
            </Button>
        </section>
    );
}

type AccountsLoadErrorProps = {
    onRetry: () => void;
};

function AccountsLoadError(props: AccountsLoadErrorProps) {
    return (
        <main class={css.loadErrorRoot}>
            <Container class={css.loadError}>
                <CircleAlert aria-hidden='true' size={38} strokeWidth={1.8}/>
                <div>
                    <h1>Не удалось загрузить счета</h1>
                    <p>
                        Проверьте подключение и принадлежность пользователя к семейному пространству.
                    </p>
                </div>
                <Button
                    startIcon={<RefreshCw size={18}/>}
                    type='button'
                    variant='secondary'
                    onClick={props.onRetry}
                >
                    Повторить
                </Button>
            </Container>
        </main>
    );
}

type HomeContentProps = {
    accounts: Accessor<PersistedAccount[] | undefined>;
};

function HomeContent(props: HomeContentProps) {
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [contacts, setContacts] = createSignal<Contact[]>(INITIAL_CONTACTS);
    const [operations, setOperations] = createSignal<Operation[]>(INITIAL_OPERATIONS);
    const [activeAccountId, setActiveAccountId] = createSignal<string>();
    const [preferredActiveAccountId, setPreferredActiveAccountId] = createSignal<string>();
    const [editingAccount, setEditingAccount] = createSignal<PersistedAccount>();
    const [isAccountDialogOpen, setIsAccountDialogOpen] = createSignal(false);
    const [accountDialogError, setAccountDialogError] = createSignal<string>();
    const [accountDialogFieldErrors, setAccountDialogFieldErrors]
        = createSignal<Record<string, string>>();
    const [isSidebarOpen, setIsSidebarOpen] = createSignal(false);
    const [detailsPanelMode, setDetailsPanelMode] = createSignal<OperationDetailsPanelMode>();
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = createSignal(false);
    const [isDetailsPanelPresent, setIsDetailsPanelPresent] = createSignal(false);
    const [selectedOperation, setSelectedOperation] = createSignal<OperationWithBalance>();
    const [isDesktopDetails, setIsDesktopDetails] = createSignal(false);
    const [isOperationStorageReady, setIsOperationStorageReady] = createSignal(false);
    const runCreateAccount = useAction(createAccountAction);
    const runUpdateAccount = useAction(updateAccountAction);
    const createAccountSubmission = useSubmission(createAccountAction);
    const updateAccountSubmission = useSubmission(updateAccountAction);

    const accountsList = () => props.accounts() ?? [];
    const isAccountsLoading = () => props.accounts() === undefined;
    const isAccountMutationPending = () => Boolean(
        createAccountSubmission.pending || updateAccountSubmission.pending
    );

    const accountBalanceMinorById = createMemo(() => {
        return new Map(accountsList().map((account) => [
            account.id,
            getAccountBalanceMinor(account, operations())
        ]));
    });

    const activeAccount = createMemo(() => {
        return accountsList().find((account) => account.id === activeAccountId()) ?? accountsList()[0];
    });

    const familyAccounts = createMemo(() => {
        return accountsList().filter((account) => account.isIncludedInFamilyTotal);
    });

    const familyTotal = createMemo(() => {
        return sumMoney(
            familyAccounts().map((account) => ({
                amount: minorUnitsToAmount(accountBalanceMinorById().get(account.id) ?? 0),
                currency: account.currency
            })),
            FAMILY_TOTAL_CURRENCY,
            FAMILY_TOTAL_EXCHANGE_RATES
        );
    });

    const exchangeRateLabels = createMemo(() => {
        return ACCOUNT_CURRENCY_OPTIONS
            .filter((currency) => currency !== FAMILY_TOTAL_CURRENCY)
            .map(formatExchangeRateLabel);
    });
    const accountDialogInitialValue = createMemo(() => {
        const account = editingAccount();

        return account ? toAccountDialogValue(account) : undefined;
    });

    createEffect(() => {
        const loadedAccounts = props.accounts();

        if (loadedAccounts) {
            const preferredAccountId = preferredActiveAccountId();

            if (preferredAccountId) {
                const preferredAccountExists = loadedAccounts.some(
                    (account) => account.id === preferredAccountId
                );

                if (preferredAccountExists) {
                    setActiveAccountId(preferredAccountId);
                    setPreferredActiveAccountId(undefined);
                }

                return;
            }

            const currentAccountId = activeAccountId();
            const currentAccountExists = loadedAccounts.some(
                (account) => account.id === currentAccountId
            );

            if (currentAccountExists) {
                return;
            }

            setActiveAccountId(loadedAccounts[0]?.id);
        }
    });

    onMount(() => {
        const storedCategories = readCategoriesFromStorage(window.localStorage);

        if (storedCategories) {
            setCategories(storedCategories);
        }

        const storedContacts = readContactsFromStorage(window.localStorage);

        if (storedContacts) {
            setContacts(mergeContactsWithImported(storedContacts, INITIAL_CONTACTS));
        }

        const storedOperations = readOperationsFromStorage(window.localStorage);

        if (storedOperations) {
            setOperations(storedOperations);
        }

        setIsOperationStorageReady(true);

        const mediaQuery = window.matchMedia(DESKTOP_DETAILS_QUERY);
        const syncDetailsMode = () => setIsDesktopDetails(mediaQuery.matches);

        syncDetailsMode();
        mediaQuery.addEventListener('change', syncDetailsMode);
        onCleanup(() => mediaQuery.removeEventListener('change', syncDetailsMode));
    });

    createEffect(() => {
        if (isOperationStorageReady()) {
            writeOperationsToStorage(window.localStorage, operations());
        }
    });

    const handleCloseDetailsPanel = () => {
        setIsDetailsPanelOpen(false);
    };

    const handleDetailsPanelPresenceChange = (present: boolean) => {
        setIsDetailsPanelPresent(present);

        if (!present) {
            setDetailsPanelMode(undefined);
            setSelectedOperation(undefined);
        }
    };

    const handleOpenCreateAccountDialog = () => {
        setIsSidebarOpen(false);
        setEditingAccount(undefined);
        setAccountDialogError(undefined);
        setAccountDialogFieldErrors(undefined);
        setIsAccountDialogOpen(true);
    };

    const handleOpenEditAccountDialog = (account: PersistedAccount) => {
        setIsSidebarOpen(false);
        setEditingAccount(account);
        setAccountDialogError(undefined);
        setAccountDialogFieldErrors(undefined);
        setIsAccountDialogOpen(true);
    };

    const handleOpenSidebar = () => {
        handleCloseDetailsPanel();
        setIsSidebarOpen(true);
    };

    const handleCloseSidebar = () => {
        setIsSidebarOpen(false);
    };

    const handleAccountSelect = (accountId: string) => {
        setActiveAccountId(accountId);
        setIsSidebarOpen(false);
        handleCloseDetailsPanel();
    };

    const handleAccountDialogOpenChange = (open: boolean) => {
        if (isAccountMutationPending()) {
            return;
        }

        setIsAccountDialogOpen(open);
    };

    const handleAccountSubmit = async (accountValue: AccountDialogValue) => {
        const currentAccount = editingAccount();
        const editableFields = {
            color: accountValue.color,
            currency: accountValue.currency,
            description: currentAccount?.description ?? '',
            initialBalanceMinor: amountToMinorUnits(accountValue.balance),
            isColorAccentEnabled: accountValue.isColorAccentEnabled,
            isIncludedInFamilyTotal: accountValue.isIncludedInFamilyTotal,
            name: accountValue.name,
            type: accountValue.type
        };

        setAccountDialogError(undefined);
        setAccountDialogFieldErrors(undefined);

        try {
            const result = currentAccount
                ? await runUpdateAccount({
                    ...editableFields,
                    id: currentAccount.id,
                    version: currentAccount.version
                })
                : await runCreateAccount(editableFields);

            if (result.ok) {
                setPreferredActiveAccountId(result.account.id);
                setActiveAccountId(result.account.id);
                setIsAccountDialogOpen(false);
                return;
            }

            setAccountDialogError(result.message);
            setAccountDialogFieldErrors(result.fieldErrors);
        }
        catch {
            setAccountDialogError(
                'Не удалось сохранить счет. Проверьте подключение и повторите попытку.'
            );
        }
    };

    const handleOperationSelect = (operation: OperationWithBalance) => {
        setSelectedOperation(operation);
        setDetailsPanelMode('edit');
        setIsDetailsPanelOpen(true);
    };

    const handleCreateOperation = () => {
        setSelectedOperation(undefined);
        setDetailsPanelMode('create');
        setIsDetailsPanelOpen(true);
    };

    const handleOperationSubmit = (value: OperationFormValue) => {
        const currentOperations = operations();
        const category = categories().find((item) => item.id === value.categoryId);
        const contact = contacts().find((item) => item.id === value.contactId);
        const selected = selectedOperation();
        const timestamp = new Date().toISOString();
        const categoryName = category?.name
            ?? (selected?.categoryId === value.categoryId ? selected.categoryName : null);
        const contactName = contact?.name
            ?? (selected?.contactId === value.contactId ? selected.contactName : null);

        if (detailsPanelMode() === 'edit' && selected) {
            const updatedOperation = updateOperation(selected, {
                allOperations: currentOperations,
                categoryName,
                contactName,
                familyCurrency: FAMILY_TOTAL_CURRENCY,
                timestamp,
                value
            });

            setOperations((items) => items.map((operation) => (
                operation.id === updatedOperation.id ? updatedOperation : operation
            )));
        }
        else {
            const account = activeAccount();
            const operation = createOperation({
                accountId: account.id,
                allOperations: currentOperations,
                categoryName,
                contactName,
                currency: account.currency,
                familyCurrency: FAMILY_TOTAL_CURRENCY,
                id: createOperationId(),
                timestamp,
                value
            });

            setOperations((items) => [...items, operation]);
        }

        handleCloseDetailsPanel();
    };

    const handleOperationDelete = (operationId: string) => {
        const timestamp = new Date().toISOString();

        setOperations((items) => items.map((operation) => (
            operation.id === operationId
                ? softDeleteOperation(operation, timestamp)
                : operation
        )));
        handleCloseDetailsPanel();
    };

    return (
        <>
            <div
                class={cn(
                    css.root,
                    isDetailsPanelPresent() && isDesktopDetails() && css.detailsOpen
                )}
            >
                <button
                    aria-label='Закрыть список счетов'
                    class={cn(css.sidebarBackdrop, isSidebarOpen() && css.sidebarBackdropVisible)}
                    type='button'
                    onClick={handleCloseSidebar}
                />
                <aside
                    aria-label='Счета'
                    class={cn(css.sidebar, isSidebarOpen() && css.sidebarOpen)}
                    id='home-accounts-sidebar'
                >
                    <Container class={css.sidebarContainer}>
                        <div class={css.currentDate}>{formatDate(new Date())}</div>
                        <div class={css.topAction}>
                            Счета
                            <Button
                                aria-label='Создать счет'
                                disabled={isAccountsLoading()}
                                iconOnly
                                type='button'
                                variant='ghost'
                                onClick={handleOpenCreateAccountDialog}
                            >
                                <Plus size={19}/>
                            </Button>
                        </div>
                        <div class={css.accountList}>
                            <Show
                                fallback={(
                                    <Show
                                        fallback={(
                                            <div class={css.accountListEmpty}>
                                                Создайте первый счет кнопкой выше
                                            </div>
                                        )}
                                        when={accountsList().length > 0}
                                    >
                                        <For each={accountsList()}>
                                            {(item) => {
                                                const accountTypeMeta = getAccountTypeMeta(item.type);
                                                const balanceMinor = () => (
                                                    accountBalanceMinorById().get(item.id) ?? 0
                                                );

                                                return (
                                                    <div
                                                        class={cn(
                                                            css.accountItem,
                                                            item.isColorAccentEnabled
                                                            && css.accountTinted,
                                                            activeAccountId() === item.id
                                                            && css.accountActive
                                                        )}
                                                        style={getAccountItemStyle(item)}
                                                    >
                                                        <button
                                                            aria-pressed={activeAccountId() === item.id}
                                                            class={css.accountSelect}
                                                            type='button'
                                                            onClick={() => handleAccountSelect(item.id)}
                                                            onDblClick={() => (
                                                                handleOpenEditAccountDialog(item)
                                                            )}
                                                        >
                                                            <AccountIcon accountType={item.type}/>
                                                            <span class={css.accountName}>
                                                                {item.name}
                                                            </span>
                                                            <span class={css.accountBody}>
                                                                <span class={css.accountMeta}>
                                                                    <span>
                                                                        {accountTypeMeta.label}
                                                                    </span>
                                                                    <span>
                                                                        {item.description
                                                                            || 'Без группы'}
                                                                    </span>
                                                                </span>
                                                                <span
                                                                    class={cn(
                                                                        css.accountSum,
                                                                        balanceMinor() < 0
                                                                        && css.accountSumNegative
                                                                    )}
                                                                >
                                                                    {formatCurrency(
                                                                        minorUnitsToAmount(
                                                                            balanceMinor()
                                                                        ),
                                                                        item.currency
                                                                    )}
                                                                </span>
                                                            </span>
                                                        </button>
                                                        <Button
                                                            aria-label={`Редактировать счет ${item.name}`}
                                                            class={css.accountEditButton}
                                                            iconOnly
                                                            size='sm'
                                                            title='Редактировать счет'
                                                            type='button'
                                                            variant='ghost'
                                                            onClick={() => (
                                                                handleOpenEditAccountDialog(item)
                                                            )}
                                                        >
                                                            <Pencil size={15}/>
                                                        </Button>
                                                    </div>
                                                );
                                            }}
                                        </For>
                                    </Show>
                                )}
                                when={isAccountsLoading()}
                            >
                                <AccountListSkeleton/>
                            </Show>
                        </div>
                        <div class={css.sidebarFooter}>
                            <div class={css.footerTitle}>Всего по семье</div>
                            <div class={css.footerSum}>
                                <Show
                                    fallback={formatCurrency(
                                        familyTotal(),
                                        FAMILY_TOTAL_CURRENCY
                                    )}
                                    when={isAccountsLoading()}
                                >
                                    <span class={css.footerSkeleton}/>
                                </Show>
                            </div>
                            <div class={css.footerMeta}>
                                <Show
                                    fallback={`Учитывается счетов: ${familyAccounts().length}`}
                                    when={isAccountsLoading()}
                                >
                                    <span class={css.footerMetaSkeleton}/>
                                </Show>
                            </div>
                            <div class={css.exchangeRates}>
                                <Show when={props.accounts()}>
                                    <For each={exchangeRateLabels()}>
                                        {(label) => <span>{label}</span>}
                                    </For>
                                </Show>
                            </div>
                        </div>
                    </Container>
                </aside>

                <main class={css.main}>
                    <Container class={css.mainContainer}>
                        <div class={css.mainToolbar}>
                            <Button
                                aria-controls='home-accounts-sidebar'
                                aria-expanded={isSidebarOpen()}
                                type='button'
                                variant='secondary'
                                onClick={handleOpenSidebar}
                            >
                                Счета
                            </Button>
                        </div>
                        <Show
                            fallback={(
                                <Show
                                    keyed
                                    fallback={(
                                        <AccountsEmptyState
                                            onCreate={handleOpenCreateAccountDialog}
                                        />
                                    )}
                                    when={activeAccount()}
                                >
                                    {(account) => {
                                        const accountTypeMeta = getAccountTypeMeta(account.type);
                                        const balanceMinor = () => (
                                            accountBalanceMinorById().get(account.id) ?? 0
                                        );

                                        return (
                                            <section class={css.accountWorkspace}>
                                                <header class={css.accountHeader}>
                                                    <div class={css.accountHeading}>
                                                        <AccountIcon
                                                            accountType={account.type}
                                                            class={css.previewAccountIcon}
                                                            style={getAccountItemStyle(account)}
                                                        />
                                                        <div>
                                                            <div class={css.previewKicker}>
                                                                {accountTypeMeta.label}
                                                            </div>
                                                            <h1 class={css.previewTitle}>
                                                                {account.name}
                                                            </h1>
                                                        </div>
                                                    </div>
                                                    <div class={css.accountHeaderBalance}>
                                                        <span>Баланс</span>
                                                        <strong>
                                                            {formatCurrency(
                                                                minorUnitsToAmount(
                                                                    balanceMinor()
                                                                ),
                                                                account.currency
                                                            )}
                                                        </strong>
                                                    </div>
                                                </header>

                                                <OperationsTable
                                                    account={account}
                                                    categories={categories()}
                                                    operations={operations()}
                                                    selectedOperationId={
                                                        selectedOperation()?.id
                                                    }
                                                    onCreateOperation={
                                                        handleCreateOperation
                                                    }
                                                    onOperationSelect={
                                                        handleOperationSelect
                                                    }
                                                />
                                            </section>
                                        );
                                    }}
                                </Show>
                            )}
                            when={isAccountsLoading()}
                        >
                            <AccountWorkspaceSkeleton/>
                        </Show>
                    </Container>
                </main>

                <Show when={detailsPanelMode() && activeAccount()}>
                    <OperationDetailsPanel
                        account={activeAccount()}
                        categories={categories()}
                        contacts={contacts()}
                        defaultExchangeRate={getDefaultTransactionExchangeRate(
                            activeAccount().currency
                        )}
                        familyCurrency={FAMILY_TOTAL_CURRENCY}
                        mobile={!isDesktopDetails()}
                        mode={detailsPanelMode() as OperationDetailsPanelMode}
                        open={isDetailsPanelOpen()}
                        operation={selectedOperation()}
                        onDelete={handleOperationDelete}
                        onOpenChange={setIsDetailsPanelOpen}
                        onPresenceChange={handleDetailsPanelPresenceChange}
                        onSubmit={handleOperationSubmit}
                    />
                </Show>
            </div>

            <AccountDialog
                error={accountDialogError()}
                fieldErrors={accountDialogFieldErrors()}
                initialValue={accountDialogInitialValue()}
                loading={isAccountMutationPending()}
                mode={editingAccount() ? 'edit' : 'create'}
                open={isAccountDialogOpen()}
                onOpenChange={handleAccountDialogOpenChange}
                onSubmit={handleAccountSubmit}
            />
        </>
    );
}

export function HomePage() {
    const accounts = createAsync(() => getAccounts());

    return (
        <>
            <Title>Операции — iFinances</Title>
            <ErrorBoundary
                fallback={(_error, reset) => (
                    <AccountsLoadError
                        onRetry={() => {
                            void revalidate(getAccounts.key, true).then(reset, reset);
                        }}
                    />
                )}
            >
                <HomeContent accounts={accounts}/>
            </ErrorBoundary>
        </>
    );
}
