import css from './home.module.scss';

import { Title } from '@solidjs/meta';
import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

import type { CreateAccountDialogValue } from './ui/create-account-dialog';
import { CreateAccountDialog } from './ui/create-account-dialog';
import { OperationDetailsPanel } from './ui/operation-details-panel';
import { OperationsTable } from './ui/operations-table';

import type { Account } from '~/entities/account';
import { INITIAL_ACCOUNTS } from '~/entities/account';
import type { Category } from '~/entities/category';
import { INITIAL_CATEGORIES, readCategoriesFromStorage } from '~/entities/category';
import type { OperationWithBalance } from '~/entities/operation';
import { getAccountBalanceMinor, INITIAL_OPERATIONS } from '~/entities/operation';
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

type DetailsPanelMode = 'create' | 'view';

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

function createAccountId(): string {
    return `account-${Date.now()}`;
}

function formatExchangeRateLabel(currency: CurrencyCodeValue): string {
    const convertedAmount = convertCurrency(1, currency, FAMILY_TOTAL_CURRENCY, FAMILY_TOTAL_EXCHANGE_RATES);

    return `1 ${currency} = ${formatCurrency(convertedAmount, FAMILY_TOTAL_CURRENCY)}`;
}

export function HomePage() {
    const [accountsList, setAccountsList] = createSignal<Account[]>(INITIAL_ACCOUNTS);
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [activeAccountId, setActiveAccountId] = createSignal(INITIAL_ACCOUNTS[0].id);
    const [isCreateAccountDialogOpen, setIsCreateAccountDialogOpen] = createSignal(false);
    const [isSidebarOpen, setIsSidebarOpen] = createSignal(false);
    const [detailsPanelMode, setDetailsPanelMode] = createSignal<DetailsPanelMode>();
    const [selectedOperation, setSelectedOperation] = createSignal<OperationWithBalance>();
    const [isDesktopDetails, setIsDesktopDetails] = createSignal(false);

    const accountBalanceMinorById = createMemo(() => {
        return new Map(accountsList().map((account) => [
            account.id,
            getAccountBalanceMinor(account, INITIAL_OPERATIONS)
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

    onMount(() => {
        const storedCategories = readCategoriesFromStorage(window.localStorage);

        if (storedCategories) {
            setCategories(storedCategories);
        }

        const mediaQuery = window.matchMedia(DESKTOP_DETAILS_QUERY);
        const syncDetailsMode = () => setIsDesktopDetails(mediaQuery.matches);

        syncDetailsMode();
        mediaQuery.addEventListener('change', syncDetailsMode);
        onCleanup(() => mediaQuery.removeEventListener('change', syncDetailsMode));
    });

    const handleCloseDetailsPanel = () => {
        setDetailsPanelMode(undefined);
        setSelectedOperation(undefined);
    };

    const handleOpenCreateAccountDialog = () => {
        setIsSidebarOpen(false);
        setIsCreateAccountDialogOpen(true);
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

    const handleCreateAccountDialogOpenChange = (open: boolean) => {
        setIsCreateAccountDialogOpen(open);
    };

    const handleCreateAccount = (accountValue: CreateAccountDialogValue) => {
        const account: Account = {
            color: accountValue.color,
            currency: accountValue.currency,
            description: 'Новый счет',
            id: createAccountId(),
            initialBalanceMinor: amountToMinorUnits(accountValue.balance),
            isColorAccentEnabled: accountValue.isColorAccentEnabled,
            isIncludedInFamilyTotal: accountValue.isIncludedInFamilyTotal,
            name: accountValue.name,
            type: accountValue.type
        };

        setAccountsList((accounts) => [...accounts, account]);
        setActiveAccountId(account.id);
        setIsCreateAccountDialogOpen(false);
    };

    const handleOperationSelect = (operation: OperationWithBalance) => {
        setSelectedOperation(operation);
        setDetailsPanelMode('view');
    };

    const handleCreateOperation = () => {
        setSelectedOperation(undefined);
        setDetailsPanelMode('create');
    };

    return (
        <>
            <Title>Операции — iFinances</Title>
            <div class={cn(css.root, detailsPanelMode() && isDesktopDetails() && css.detailsOpen)}>
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
                                iconOnly
                                type='button'
                                variant='ghost'
                                onClick={handleOpenCreateAccountDialog}
                            >
                                +
                            </Button>
                        </div>
                        <div class={css.accountList}>
                            <For each={accountsList()}>
                                {(item) => {
                                    const accountTypeMeta = getAccountTypeMeta(item.type);
                                    const balanceMinor = () => accountBalanceMinorById().get(item.id) ?? 0;

                                    return (
                                        <button
                                            aria-pressed={activeAccountId() === item.id}
                                            class={cn(
                                                css.accountItem,
                                                item.isColorAccentEnabled && css.accountTinted,
                                                activeAccountId() === item.id && css.accountActive
                                            )}
                                            style={getAccountItemStyle(item)}
                                            type='button'
                                            onClick={() => handleAccountSelect(item.id)}
                                        >
                                            <AccountIcon accountType={item.type}/>
                                            <span class={css.accountName}>{item.name}</span>
                                            <span class={css.accountBody}>
                                                <span class={css.accountMeta}>
                                                    <span>{accountTypeMeta.label}</span>
                                                    <span>{item.description || 'Без группы'}</span>
                                                </span>
                                                <span
                                                    class={cn(
                                                        css.accountSum,
                                                        balanceMinor() < 0 && css.accountSumNegative
                                                    )}
                                                >
                                                    {formatCurrency(
                                                        minorUnitsToAmount(balanceMinor()),
                                                        item.currency
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                }}
                            </For>
                        </div>
                        <div class={css.sidebarFooter}>
                            <div class={css.footerTitle}>Всего по семье</div>
                            <div class={css.footerSum}>{formatCurrency(familyTotal(), FAMILY_TOTAL_CURRENCY)}</div>
                            <div class={css.footerMeta}>
                                Учитывается счетов: {familyAccounts().length}
                            </div>
                            <div class={css.exchangeRates}>
                                <For each={exchangeRateLabels()}>
                                    {(label) => <span>{label}</span>}
                                </For>
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
                        <Show keyed when={activeAccount()}>
                            {(account) => {
                                const accountTypeMeta = getAccountTypeMeta(account.type);
                                const balanceMinor = () => accountBalanceMinorById().get(account.id) ?? 0;

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
                                                    <div class={css.previewKicker}>{accountTypeMeta.label}</div>
                                                    <h1 class={css.previewTitle}>{account.name}</h1>
                                                </div>
                                            </div>
                                            <div class={css.accountHeaderBalance}>
                                                <span>Баланс</span>
                                                <strong>{formatCurrency(
                                                    minorUnitsToAmount(balanceMinor()),
                                                    account.currency
                                                )}</strong>
                                            </div>
                                        </header>

                                        <OperationsTable
                                            account={account}
                                            categories={categories()}
                                            operations={INITIAL_OPERATIONS}
                                            selectedOperationId={selectedOperation()?.id}
                                            onCreateOperation={handleCreateOperation}
                                            onOperationSelect={handleOperationSelect}
                                        />
                                    </section>
                                );
                            }}
                        </Show>
                    </Container>
                </main>

                <Show when={detailsPanelMode() && isDesktopDetails() && activeAccount()}>
                    <OperationDetailsPanel
                        account={activeAccount()}
                        mobile={false}
                        mode={detailsPanelMode() as DetailsPanelMode}
                        operation={selectedOperation()}
                        onClose={handleCloseDetailsPanel}
                    />
                </Show>
            </div>

            <Show when={detailsPanelMode() && !isDesktopDetails() && activeAccount()}>
                <OperationDetailsPanel
                    account={activeAccount()}
                    mobile
                    mode={detailsPanelMode() as DetailsPanelMode}
                    operation={selectedOperation()}
                    onClose={handleCloseDetailsPanel}
                />
            </Show>

            <CreateAccountDialog
                open={isCreateAccountDialogOpen()}
                onCreateAccount={handleCreateAccount}
                onOpenChange={handleCreateAccountDialogOpenChange}
            />
        </>
    );
}
