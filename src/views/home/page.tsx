import css from './home.module.scss';

import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { CreateAccountDialogValue } from './ui/create-account-dialog';
import { CreateAccountDialog } from './ui/create-account-dialog';

import type { AccountTypeValue, CurrencyCodeValue, CurrencyExchangeRates } from '~/shared/lib';
import {
    AccountColor,
    AccountType,
    cn,
    convertCurrency,
    CurrencyCode,
    formatCurrency,
    formatDate,
    getAccountTypeMeta,
    sumMoney
} from '~/shared/lib';
import { AccountIcon, Button, Container } from '~/shared/ui';

type AccountItem = {
    id: string;
    name: string;
    balance: number;
    description: string;
    currency: CurrencyCodeValue;
    type: AccountTypeValue;
    color: string;
    isColorAccentEnabled: boolean;
    isIncludedInFamilyTotal: boolean;
};

const FAMILY_TOTAL_CURRENCY = CurrencyCode.BYN;

const FAMILY_TOTAL_EXCHANGE_RATES = {
    baseCurrency: CurrencyCode.BYN,
    ratesToBaseCurrency: {
        [CurrencyCode.USD]: 3.25,
        [CurrencyCode.EUR]: 3.75
    }
} satisfies CurrencyExchangeRates;

const ACCOUNT_CURRENCY_OPTIONS = CurrencyCode.values();

const INITIAL_ACCOUNTS: AccountItem[] = [
    {
        balance: 5_848.86,
        color: AccountColor.GREEN,
        currency: CurrencyCode.BYN,
        description: 'Семья',
        id: 'cash-byn',
        isColorAccentEnabled: true,
        isIncludedInFamilyTotal: true,
        name: 'Наличные',
        type: AccountType.CASH
    },
    {
        balance: 5_550,
        color: AccountColor.BLUE,
        currency: CurrencyCode.USD,
        description: 'Семья',
        id: 'reserve-usd',
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: true,
        name: 'НЗ USD',
        type: AccountType.SAVINGS
    },
    {
        balance: 2_825,
        color: AccountColor.VIOLET,
        currency: CurrencyCode.EUR,
        description: 'Личный резерв',
        id: 'reserve-eur',
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: true,
        name: 'НЗ EUR',
        type: AccountType.SAVINGS
    },
    {
        balance: 127,
        color: AccountColor.SLATE,
        currency: CurrencyCode.USD,
        description: 'Биржа',
        id: 'bybit-usdt',
        isColorAccentEnabled: false,
        isIncludedInFamilyTotal: false,
        name: 'USDT ByBit',
        type: AccountType.OTHER
    }
];

function getAccountItemStyle(account: AccountItem): JSX.CSSProperties {
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
    const [accountsList, setAccountsList] = createSignal<AccountItem[]>(INITIAL_ACCOUNTS);
    const [activeAccountId, setActiveAccountId] = createSignal(INITIAL_ACCOUNTS[0].id);
    const [isCreateAccountDialogOpen, setIsCreateAccountDialogOpen] = createSignal(false);
    const [isSidebarOpen, setIsSidebarOpen] = createSignal(false);

    const activeAccount = createMemo(() => {
        return accountsList().find((account) => account.id === activeAccountId()) ?? accountsList()[0];
    });

    const familyAccounts = createMemo(() => {
        return accountsList().filter((account) => account.isIncludedInFamilyTotal);
    });

    const familyTotal = createMemo(() => {
        return sumMoney(
            familyAccounts().map((account) => ({
                amount: account.balance,
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

    const handleOpenCreateAccountDialog = () => {
        setIsSidebarOpen(false);
        setIsCreateAccountDialogOpen(true);
    };

    const handleOpenSidebar = () => {
        setIsSidebarOpen(true);
    };

    const handleCloseSidebar = () => {
        setIsSidebarOpen(false);
    };

    const handleAccountSelect = (accountId: string) => {
        setActiveAccountId(accountId);
        setIsSidebarOpen(false);
    };

    const handleCreateAccountDialogOpenChange = (open: boolean) => {
        setIsCreateAccountDialogOpen(open);
    };

    const handleCreateAccount = (accountValue: CreateAccountDialogValue) => {
        const account: AccountItem = {
            ...accountValue,
            description: 'Новый счет',
            id: createAccountId()
        };

        setAccountsList((accounts) => [...accounts, account]);
        setActiveAccountId(account.id);
        setIsCreateAccountDialogOpen(false);
    };

    return (
        <>
            <div class={css.root}>
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
                                                        item.balance < 0 && css.accountSumNegative
                                                    )}
                                                >
                                                    {formatCurrency(item.balance, item.currency)}
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
                                const accountInFamilyCurrency = convertCurrency(
                                    account.balance,
                                    account.currency,
                                    FAMILY_TOTAL_CURRENCY,
                                    FAMILY_TOTAL_EXCHANGE_RATES
                                );

                                return (
                                    <section class={css.accountPreview}>
                                        <div class={css.previewHeading}>
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
                                        <dl class={css.previewStats}>
                                            <div>
                                                <dt>Баланс счета</dt>
                                                <dd>{formatCurrency(account.balance, account.currency)}</dd>
                                            </div>
                                            <div>
                                                <dt>В валюте семьи</dt>
                                                <dd>{formatCurrency(accountInFamilyCurrency, FAMILY_TOTAL_CURRENCY)}</dd>
                                            </div>
                                            <div>
                                                <dt>Всего по семье</dt>
                                                <dd>{account.isIncludedInFamilyTotal ? 'Учитывается' : 'Не учитывается'}</dd>
                                            </div>
                                        </dl>
                                    </section>
                                );
                            }}
                        </Show>
                    </Container>
                </main>
            </div>

            <CreateAccountDialog
                open={isCreateAccountDialogOpen()}
                onCreateAccount={handleCreateAccount}
                onOpenChange={handleCreateAccountDialogOpenChange}
            />
        </>
    );
}
