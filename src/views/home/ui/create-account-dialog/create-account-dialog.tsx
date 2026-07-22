import css from './create-account-dialog.module.scss';

import type { JSX } from 'solid-js';
import { createSignal, For } from 'solid-js';

import type { AccountTypeValue, CurrencyCodeValue } from '~/shared/lib';
import { AccountColor, AccountType, cn, CurrencyCode, getAccountTypeMeta, getCurrencySymbol } from '~/shared/lib';
import { AccountIcon, Dialog, TextField, Typography } from '~/shared/ui';

const ACCOUNT_CURRENCY_OPTIONS = CurrencyCode.values();
const DEFAULT_ACCOUNT_COLOR = AccountColor.BLUE;

export type CreateAccountDialogValue = {
    name: string;
    balance: number;
    currency: CurrencyCodeValue;
    type: AccountTypeValue;
    color: string;
    isColorAccentEnabled: boolean;
    isIncludedInFamilyTotal: boolean;
};

export type CreateAccountDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreateAccount: (account: CreateAccountDialogValue) => void;
};

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

export function CreateAccountDialog(props: CreateAccountDialogProps) {
    const [accountName, setAccountName] = createSignal('');
    const [accountBalance, setAccountBalance] = createSignal('');
    const [accountCurrency, setAccountCurrency] = createSignal<CurrencyCodeValue>(CurrencyCode.BYN);
    const [accountColor, setAccountColor] = createSignal<string>(DEFAULT_ACCOUNT_COLOR);
    const [accountType, setAccountType] = createSignal<AccountTypeValue>(AccountType.CARD);
    const [isColorAccentEnabled, setIsColorAccentEnabled] = createSignal(false);
    const [isIncludedInFamilyTotal, setIsIncludedInFamilyTotal] = createSignal(true);

    const resetForm = () => {
        setAccountName('');
        setAccountBalance('');
        setAccountCurrency(CurrencyCode.BYN);
        setAccountColor(DEFAULT_ACCOUNT_COLOR);
        setAccountType(AccountType.CARD);
        setIsColorAccentEnabled(false);
        setIsIncludedInFamilyTotal(true);
    };

    const closeDialog = () => {
        props.onOpenChange(false);
        resetForm();
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            closeDialog();
            return;
        }

        props.onOpenChange(true);
    };

    const handleNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setAccountName(event.currentTarget.value);
    };

    const handleBalanceInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setAccountBalance(event.currentTarget.value);
    };

    const handleCurrencyChange = (event: Event & { currentTarget: HTMLSelectElement }) => {
        const value = event.currentTarget.value;

        if (CurrencyCode.isCurrencyCode(value)) {
            setAccountCurrency(value);
        }
    };

    const handleCustomColorInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
        setAccountColor(event.currentTarget.value);
    };

    const handleColorAccentChange = (event: Event & { currentTarget: HTMLInputElement }) => {
        setIsColorAccentEnabled(event.currentTarget.checked);
    };

    const handleFamilyTotalChange = (event: Event & { currentTarget: HTMLInputElement }) => {
        setIsIncludedInFamilyTotal(event.currentTarget.checked);
    };

    const handleCreateAccountSubmit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
        event.preventDefault();

        const name = accountName().trim();

        if (!name) {
            return;
        }

        props.onCreateAccount({
            balance: parseBalanceInput(accountBalance()),
            color: accountColor(),
            currency: accountCurrency(),
            isColorAccentEnabled: isColorAccentEnabled(),
            isIncludedInFamilyTotal: isIncludedInFamilyTotal(),
            name,
            type: accountType()
        });
        closeDialog();
    };

    return (
        <Dialog.Root
            open={props.open}
            onOpenChange={handleOpenChange}
        >
            <Dialog.Content
                as='form'
                onSubmit={handleCreateAccountSubmit}
            >
                <Dialog.Header closeLabel='Закрыть окно создания счета'>
                    <Dialog.Title>Создание счета</Dialog.Title>
                    <Typography tone='secondary'>Добавьте карту, наличные или накопления семьи</Typography>
                </Dialog.Header>

                <Dialog.Body>
                    <div class={css.formGrid}>
                        <div class={css.formFieldFull}>
                            <div class={css.formLabel}>Тип счета</div>
                            <div class={css.typeOptions}>
                                <For each={AccountType.values()}>
                                    {(currentAccountType) => {
                                        const accountTypeMeta = getAccountTypeMeta(currentAccountType);

                                        return (
                                            <label
                                                class={cn(
                                                    css.typeOption,
                                                    accountType() === currentAccountType && css.typeOptionActive
                                                )}
                                            >
                                                <input
                                                    checked={accountType() === currentAccountType}
                                                    name='account-type'
                                                    type='radio'
                                                    value={currentAccountType}
                                                    onChange={() => setAccountType(currentAccountType)}
                                                />
                                                <AccountIcon accountType={currentAccountType} class={css.typeIcon}/>
                                                <span>{accountTypeMeta.label}</span>
                                                <span class={css.typeDescription}>{accountTypeMeta.description}</span>
                                            </label>
                                        );
                                    }}
                                </For>
                            </div>
                        </div>

                        <TextField
                            class={css.formFieldFull}
                            label='Название счета'
                            placeholder='Например, Основная карта'
                            required
                            value={accountName()}
                            onInput={handleNameInput}
                        />

                        <TextField
                            inputMode='decimal'
                            label='Начальный баланс'
                            placeholder='0,00'
                            step='0.01'
                            type='number'
                            value={accountBalance()}
                            endContent={<span>{accountCurrency()}</span>}
                            onInput={handleBalanceInput}
                        />

                        <label class={css.fieldGroup}>
                            <span class={css.formLabel}>Валюта счета</span>
                            <select
                                class={css.select}
                                value={accountCurrency()}
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
                            <div class={css.formLabel}>Цвет счета</div>
                            <div class={css.colorOptions}>
                                <For each={AccountColor.values()}>
                                    {(color) => (
                                        <button
                                            aria-label={`Выбрать цвет ${color}`}
                                            class={cn(
                                                css.colorSwatch,
                                                accountColor() === color && css.colorSwatchActive
                                            )}
                                            style={getColorSwatchStyle(color)}
                                            type='button'
                                            onClick={() => setAccountColor(color)}
                                        />
                                    )}
                                </For>
                                <label class={css.customColor}>
                                    <span>Свой</span>
                                    <input
                                        aria-label='Выбрать свой цвет счета'
                                        type='color'
                                        value={accountColor()}
                                        onInput={handleCustomColorInput}
                                    />
                                </label>
                            </div>
                        </div>

                        <div class={css.booleanOptions}>
                            <label class={css.checkboxRow}>
                                <input
                                    checked={isColorAccentEnabled()}
                                    type='checkbox'
                                    onChange={handleColorAccentChange}
                                />
                                <span>Выделить счет цветом</span>
                            </label>

                            <label class={css.switchRow}>
                                <span>Учитывать в &quot;Всего по семье&quot;</span>
                                <span class={css.switch}>
                                    <input
                                        checked={isIncludedInFamilyTotal()}
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
                    <Dialog.Action disabled={!accountName().trim()} type='submit'>
                        Создать
                    </Dialog.Action>
                </Dialog.Footer>
            </Dialog.Content>
        </Dialog.Root>
    );
}
