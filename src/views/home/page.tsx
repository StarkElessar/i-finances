import css from './home.module.scss';

import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { AccountTypeValue, CurrencyCodeValue, CurrencyExchangeRates } from '~/shared/lib';
import {
    AccountType,
    cn,
    convertCurrency,
    CurrencyCode,
    formatCurrency,
    formatDate,
    getAccountTypeMeta,
    getCurrencySymbol,
    sumMoney
} from '~/shared/lib';
import { AccountIcon, Button, Container, Dialog, TextField } from '~/shared/ui';

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
const ACCOUNT_COLOR_OPTIONS = ['#3f77a8', '#147a50', '#a15c00', '#c82d4d', '#6b5bd2', '#526078'] as const;

const INITIAL_ACCOUNTS: AccountItem[] = [
    {
        balance: 5_848.86,
        color: '#147a50',
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
        color: '#3f77a8',
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
        color: '#6b5bd2',
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
        color: '#526078',
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

function getColorSwatchStyle(color: string): JSX.CSSProperties {
    return {
        'background-color': color
    };
}

function getCurrencyOptionLabel(currency: CurrencyCodeValue): string {
    return `${currency} ${getCurrencySymbol(currency)}`;
}

function parseBalanceInput(value: string): number {
    const normalizedValue = value.trim().replace(',', '.');

    if (!normalizedValue) {
        return 0;
    }

    const amount = Number(normalizedValue);

    if (!Number.isFinite(amount)) {
        return 0;
    }

    return amount;
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
    const [newAccountName, setNewAccountName] = createSignal('');
    const [newAccountBalance, setNewAccountBalance] = createSignal('');
    const [newAccountCurrency, setNewAccountCurrency] = createSignal<CurrencyCodeValue>(CurrencyCode.BYN);
    const [newAccountColor, setNewAccountColor] = createSignal<string>(ACCOUNT_COLOR_OPTIONS[0]);
    const [newAccountType, setNewAccountType] = createSignal<AccountTypeValue>(AccountType.CARD);
    const [isNewAccountColorAccentEnabled, setIsNewAccountColorAccentEnabled] = createSignal(false);
    const [isNewAccountIncludedInFamilyTotal, setIsNewAccountIncludedInFamilyTotal] = createSignal(true);

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

    const resetNewAccountForm = () => {
        setNewAccountName('');
        setNewAccountBalance('');
        setNewAccountCurrency(CurrencyCode.BYN);
        setNewAccountColor(ACCOUNT_COLOR_OPTIONS[0]);
        setNewAccountType(AccountType.CARD);
        setIsNewAccountColorAccentEnabled(false);
        setIsNewAccountIncludedInFamilyTotal(true);
    };

    const handleOpenCreateAccountDialog = () => {
        setIsCreateAccountDialogOpen(true);
    };

    const handleCloseCreateAccountDialog = () => {
        setIsCreateAccountDialogOpen(false);
        resetNewAccountForm();
    };

    const handleNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setNewAccountName(event.currentTarget.value);
    };

    const handleBalanceInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setNewAccountBalance(event.currentTarget.value);
    };

    const handleCurrencyChange = (event: Event & { currentTarget: HTMLSelectElement }) => {
        const value = event.currentTarget.value;

        if (CurrencyCode.isCurrencyCode(value)) {
            setNewAccountCurrency(value);
        }
    };

    const handleCustomColorInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setNewAccountColor(event.currentTarget.value);
    };

    const handleColorAccentChange = (event: Event & { currentTarget: HTMLInputElement }) => {
        setIsNewAccountColorAccentEnabled(event.currentTarget.checked);
    };

    const handleFamilyTotalChange = (event: Event & { currentTarget: HTMLInputElement }) => {
        setIsNewAccountIncludedInFamilyTotal(event.currentTarget.checked);
    };

    const handleCreateAccountSubmit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
        event.preventDefault();

        const name = newAccountName().trim();

        if (!name) {
            return;
        }

        const account: AccountItem = {
            balance: parseBalanceInput(newAccountBalance()),
            color: newAccountColor(),
            currency: newAccountCurrency(),
            description: 'Новый счет',
            id: createAccountId(),
            isColorAccentEnabled: isNewAccountColorAccentEnabled(),
            isIncludedInFamilyTotal: isNewAccountIncludedInFamilyTotal(),
            name,
            type: newAccountType()
        };

        setAccountsList((accounts) => [...accounts, account]);
        setActiveAccountId(account.id);
        setIsCreateAccountDialogOpen(false);
        resetNewAccountForm();
    };

    return (
        <>
            <div class={css.root}>
                <aside class={css.sidebar}>
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
                                            onClick={() => setActiveAccountId(item.id)}
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

            <Dialog.Root
                open={isCreateAccountDialogOpen()}
                onOpenChange={(open) => {
                    if (!open) {
                        handleCloseCreateAccountDialog();
                    }
                }}
            >
                <Dialog.Content
                    as='form'
                    onSubmit={handleCreateAccountSubmit}
                >
                    <Dialog.Header closeLabel='Закрыть окно создания счета'>
                        <Dialog.Kicker>Новый счет</Dialog.Kicker>
                        <Dialog.Title>Создание счета</Dialog.Title>
                    </Dialog.Header>

                    <Dialog.Body>
                        <div class={css.formGrid}>
                            <TextField
                                class={css.formFieldFull}
                                label='Название счета'
                                placeholder='Например, Основная карта'
                                required
                                value={newAccountName()}
                                onInput={handleNameInput}
                            />

                            <TextField
                                inputMode='decimal'
                                label='Начальный баланс'
                                placeholder='0,00'
                                step='0.01'
                                type='number'
                                value={newAccountBalance()}
                                endContent={<span>{newAccountCurrency()}</span>}
                                onInput={handleBalanceInput}
                            />

                            <label class={css.fieldGroup}>
                                <span class={css.formLabel}>Валюта счета</span>
                                <select
                                    class={css.select}
                                    value={newAccountCurrency()}
                                    onChange={handleCurrencyChange}
                                >
                                    <For each={ACCOUNT_CURRENCY_OPTIONS}>
                                        {(currency) => (
                                            <option value={currency}>{getCurrencyOptionLabel(currency)}</option>
                                        )}
                                    </For>
                                </select>
                            </label>

                            <div class={css.formFieldFull}>
                                <div class={css.formLabel}>Тип счета</div>
                                <div class={css.typeOptions}>
                                    <For each={AccountType.values()}>
                                        {(accountType) => {
                                            const accountTypeMeta = getAccountTypeMeta(accountType);

                                            return (
                                                <label
                                                    class={cn(
                                                        css.typeOption,
                                                        newAccountType() === accountType && css.typeOptionActive
                                                    )}
                                                >
                                                    <input
                                                        checked={newAccountType() === accountType}
                                                        name='account-type'
                                                        type='radio'
                                                        value={accountType}
                                                        onChange={() => setNewAccountType(accountType)}
                                                    />
                                                    <AccountIcon accountType={accountType}/>
                                                    <span>{accountTypeMeta.label}</span>
                                                </label>
                                            );
                                        }}
                                    </For>
                                </div>
                            </div>

                            <div class={css.formFieldFull}>
                                <div class={css.formLabel}>Цвет счета</div>
                                <div class={css.colorOptions}>
                                    <For each={ACCOUNT_COLOR_OPTIONS}>
                                        {(color) => (
                                            <button
                                                aria-label={`Выбрать цвет ${color}`}
                                                class={cn(
                                                    css.colorSwatch,
                                                    newAccountColor() === color && css.colorSwatchActive
                                                )}
                                                style={getColorSwatchStyle(color)}
                                                type='button'
                                                onClick={() => setNewAccountColor(color)}
                                            />
                                        )}
                                    </For>
                                    <label class={css.customColor}>
                                        <span>Свой</span>
                                        <input
                                            aria-label='Выбрать свой цвет счета'
                                            type='color'
                                            value={newAccountColor()}
                                            onInput={handleCustomColorInput}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div class={css.booleanOptions}>
                                <label class={css.checkboxRow}>
                                    <input
                                        checked={isNewAccountColorAccentEnabled()}
                                        type='checkbox'
                                        onChange={handleColorAccentChange}
                                    />
                                    <span>Выделить счет цветом</span>
                                </label>

                                <label class={css.switchRow}>
                                    <span>Учитывать в &quot;Всего по семье&quot;</span>
                                    <span class={css.switch}>
                                        <input
                                            checked={isNewAccountIncludedInFamilyTotal()}
                                            class={css.switchInput}
                                            type='checkbox'
                                            onChange={handleFamilyTotalChange}
                                        />
                                        <span class={css.switchControl}/>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </Dialog.Body>

                    <Dialog.Footer>
                        <Dialog.Action
                            closeOnClick
                            intent='cancel'
                        >
                            Отмена
                        </Dialog.Action>
                        <Dialog.Action disabled={!newAccountName().trim()} type='submit'>
                            Создать
                        </Dialog.Action>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Root>
        </>
    );
}
