import css from './account-dialog.module.scss';

import type { AccountTypeValue, CurrencyCodeValue } from '~/shared/lib';
import {
	AccountColor,
	AccountType,
	cn,
	CurrencyCode,
	getAccountTypeMeta,
	getCurrencySymbol
} from '~/shared/lib';
import { AccountIcon } from '~/shared/ui/account-icon';
import { ColorPicker } from '~/shared/ui/color-picker';
import { Dialog } from '~/shared/ui/dialog';
import { Switch } from '~/shared/ui/switch';
import { TextField } from '~/shared/ui/text-field';

import { createEffect, createSignal, For, Show } from 'solid-js';

const ACCOUNT_CURRENCY_OPTIONS = CurrencyCode.values();
const DEFAULT_ACCOUNT_COLOR = AccountColor.BLUE;

export type AccountDialogMode = 'create' | 'edit';

export type AccountDialogValue = {
	balance: number;
	color: string;
	currency: CurrencyCodeValue;
	isColorAccentEnabled: boolean;
	isIncludedInFamilyTotal: boolean;
	name: string;
	type: AccountTypeValue;
};

export type AccountDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (account: AccountDialogValue) => Promise<void> | void;
	error?: string;
	fieldErrors?: Record<string, string>;
	initialValue?: AccountDialogValue;
	loading?: boolean;
	mode?: AccountDialogMode;
};

function getCurrencyOptionLabel(currency: CurrencyCodeValue): string {
	return `${currency} ${getCurrencySymbol(currency)}`;
}

function parseBalanceInput(value: string): number {
	const normalizedValue = value.trim().replace(',', '.');

	if (normalizedValue === '') {
		return 0;
	}

	const amount = Number(normalizedValue);

	return Number.isFinite(amount) ? amount : 0;
}

function createDefaultDialogValue(): AccountDialogValue {
	return {
		balance: 0,
		color: DEFAULT_ACCOUNT_COLOR,
		currency: CurrencyCode.BYN,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: '',
		type: AccountType.CARD
	};
}

function formatBalanceInput(value: number): string {
	return value === 0 ? '' : String(value);
}

/**
 * Renders the shared create/edit form for a persisted account.
 */
export function AccountDialog(props: AccountDialogProps) {
	const [accountName, setAccountName] = createSignal('');
	const [accountBalance, setAccountBalance] = createSignal('');
	const [accountCurrency, setAccountCurrency] = createSignal<CurrencyCodeValue>(CurrencyCode.BYN);
	const [accountColor, setAccountColor] = createSignal<string>(DEFAULT_ACCOUNT_COLOR);
	const [accountType, setAccountType] = createSignal<AccountTypeValue>(AccountType.CARD);
	const [isColorAccentEnabled, setIsColorAccentEnabled] = createSignal(false);
	const [isIncludedInFamilyTotal, setIsIncludedInFamilyTotal] = createSignal(true);

	const mode = () => props.mode ?? 'create';
	const isEditMode = () => mode() === 'edit';
	const title = () => isEditMode() ? 'Редактирование счета' : 'Создание счета';
	const description = () => isEditMode()
		? 'Измените параметры счета и сохраните результат'
		: 'Добавьте карту, наличные или накопления семьи';
	const submitLabel = () => isEditMode() ? 'Сохранить' : 'Создать';

	createEffect(() => {
		if (props.open) {
			const value = props.initialValue ?? createDefaultDialogValue();

			setAccountName(value.name);
			setAccountBalance(formatBalanceInput(value.balance));
			setAccountCurrency(value.currency);
			setAccountColor(value.color);
			setAccountType(value.type);
			setIsColorAccentEnabled(value.isColorAccentEnabled);
			setIsIncludedInFamilyTotal(value.isIncludedInFamilyTotal);
		}
	});

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

	const handleColorAccentChange = (event: Event & { currentTarget: HTMLInputElement }) => {
		setIsColorAccentEnabled(event.currentTarget.checked);
	};

	const handleFamilyTotalChange = (event: Event & { currentTarget: HTMLInputElement }) => {
		setIsIncludedInFamilyTotal(event.currentTarget.checked);
	};

	const handleSubmit = (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();

		const name = accountName().trim();

		if (name) {
			void props.onSubmit({
				balance: parseBalanceInput(accountBalance()),
				color: accountColor(),
				currency: accountCurrency(),
				isColorAccentEnabled: isColorAccentEnabled(),
				isIncludedInFamilyTotal: isIncludedInFamilyTotal(),
				name,
				type: accountType()
			});
		}
	};

	return (
		<Dialog.Root
			closeOnBackdropClick={!props.loading}
			closeOnEscape={!props.loading}
			open={props.open}
			onOpenChange={props.onOpenChange}
		>
			<Dialog.Content as='form' onSubmit={handleSubmit}>
				<Dialog.Header
					closeLabel='Закрыть окно счета'
					hideCloseButton={props.loading}
				>
					<Dialog.Title>{title()}</Dialog.Title>
					<Dialog.Description>{description()}</Dialog.Description>
				</Dialog.Header>

				<Dialog.Body>
					<fieldset class={css.formGrid} disabled={props.loading}>
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
													accountType() === currentAccountType
													&& css.typeOptionActive
												)}
											>
												<input
													checked={accountType() === currentAccountType}
													name='account-type'
													type='radio'
													value={currentAccountType}
													onChange={() => setAccountType(currentAccountType)}
												/>
												<AccountIcon
													accountType={currentAccountType}
													class={css.typeIcon}
												/>
												<span>{accountTypeMeta.label}</span>
												<span class={css.typeDescription}>
													{accountTypeMeta.description}
												</span>
											</label>
										);
									}}
								</For>
							</div>
						</div>

						<TextField
							class={css.formFieldFull}
							error={props.fieldErrors?.name}
							label='Название счета'
							maxLength={120}
							placeholder='Например, Основная карта'
							required
							value={accountName()}
							onInput={handleNameInput}
						/>

						<TextField
							error={props.fieldErrors?.initialBalanceMinor}
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
										<option value={currency}>
											{getCurrencyOptionLabel(currency)}
										</option>
									)}
								</For>
							</select>
						</label>

						<ColorPicker
							class={css.formFieldFull}
							label='Цвет счета'
							value={accountColor()}
							onChange={setAccountColor}
						/>

						<div class={css.booleanOptions}>
							<label class={css.switchRow}>
								<span>Выделить счет цветом</span>
								<Switch
									checked={isColorAccentEnabled()}
									onChange={handleColorAccentChange}
								/>
							</label>

							<label class={css.switchRow}>
								<span>Учитывать в &quot;Всего по семье&quot;</span>
								<Switch
									checked={isIncludedInFamilyTotal()}
									onChange={handleFamilyTotalChange}
								/>
							</label>
						</div>
					</fieldset>

					<Show when={props.error}>
						<p class={css.error} role='alert'>{props.error}</p>
					</Show>
				</Dialog.Body>

				<Dialog.Footer>
					<Dialog.Action
						closeOnClick
						disabled={props.loading}
						intent='cancel'
					>
						Отмена
					</Dialog.Action>
					<Dialog.Action
						disabled={!accountName().trim()}
						loading={props.loading}
						type='submit'
					>
						{submitLabel()}
					</Dialog.Action>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
