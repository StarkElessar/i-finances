import css from './transfer-dialog.module.scss';

import {
	cn,
	convertMinorUnitsByExchangeRate,
	formatMinorUnitsAsInput,
	formatMinorUnitsCurrency,
	normalizeExchangeRate,
	parseOptionalMoneyInputToMinorUnits
} from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import { Combobox } from '~/shared/ui/combobox';
import { Dialog } from '~/shared/ui/dialog';
import { TextField } from '~/shared/ui/text-field';

import type { PersistedAccount } from '~/entities/account';
import type { ContactType, PersistedContact } from '~/entities/contact';
import {
	formatLocalDateKey,
	tryParseLocalDateKey
} from '~/entities/operation';
import type { Transfer } from '~/entities/transfer';

import { Building2, Trash2, UserRound } from 'lucide-solid';
import {
	createEffect,
	createMemo,
	createSignal,
	Show
} from 'solid-js';

export type TransferDialogMode = 'create' | 'edit';

export type TransferDialogSubmitValue = {
	comment: string;
	contactId: string | null;
	exchangeRate: string;
	fromAccountId: string;
	fromAmountMinor: number;
	happenedOn: string;
	toAccountId: string;
};

export type TransferDialogProps = {
	accounts: readonly PersistedAccount[];
	contacts: readonly PersistedContact[];
	mode: TransferDialogMode;
	onOpenChange: (open: boolean) => void;
	onSubmit: (value: TransferDialogSubmitValue) => Promise<void> | void;
	open: boolean;
	error?: string;
	fieldErrors?: Record<string, string>;
	loading?: boolean;
	onDelete?: () => Promise<void> | void;
	transfer?: Transfer;
};

type AccountOption = {
	currency: PersistedAccount['currency'];
	id: string;
	name: string;
};

type ContactOption = {
	archived: boolean;
	color: string;
	id: string;
	legalName: string | null;
	name: string;
	type: ContactType;
};

/**
 * Renders the create/edit dialog for a cross-currency account transfer.
 */
export function TransferDialog(props: TransferDialogProps) {
	const [fromAccountId, setFromAccountId] = createSignal<string | null>(null);
	const [toAccountId, setToAccountId] = createSignal<string | null>(null);
	const [amountInput, setAmountInput] = createSignal('');
	const [rateInput, setRateInput] = createSignal('');
	const [happenedOn, setHappenedOn] = createSignal(formatLocalDateKey(new Date()));
	const [contactId, setContactId] = createSignal<string | null>(null);
	const [comment, setComment] = createSignal('');
	const [localError, setLocalError] = createSignal<string>();

	const accountOptions = createMemo((): AccountOption[] => {
		return props.accounts.map((account) => ({
			currency: account.currency,
			id: account.id,
			name: account.name
		}));
	});

	const fromAccount = createMemo(() => {
		const id = fromAccountId();

		return accountOptions().find((account) => account.id === id);
	});

	const toAccountOptions = createMemo(() => {
		const from = fromAccount();

		return accountOptions().filter((account) => {
			if (from === undefined) {
				return true;
			}

			return account.id !== from.id && account.currency !== from.currency;
		});
	});

	const toAccount = createMemo(() => {
		const id = toAccountId();

		return toAccountOptions().find((account) => account.id === id);
	});

	const contactOptions = createMemo((): ContactOption[] => {
		const options = props.contacts.map((contact) => ({
			archived: contact.archivedAt !== null,
			color: contact.color,
			id: contact.id,
			legalName: contact.legalName,
			name: contact.name,
			type: contact.type
		}));
		const selected = props.transfer?.contactId;

		if (
			selected
			&& !options.some((option) => option.id === selected)
			&& props.transfer?.contactName
		) {
			return [
				{
					archived: true,
					color: 'var(--color-border-strong)',
					id: selected,
					legalName: null,
					name: props.transfer.contactName,
					type: 'company'
				},
				...options
			];
		}

		return options;
	});

	const creditPreview = createMemo(() => {
		const amountMinor = parseOptionalMoneyInputToMinorUnits(amountInput());
		const rate = normalizeExchangeRate(rateInput());
		const target = toAccount();

		if (
			amountMinor === null
			|| amountMinor === undefined
			|| amountMinor <= 0
			|| rate === undefined
			|| target === undefined
		) {
			return undefined;
		}

		try {
			const toAmountMinor = convertMinorUnitsByExchangeRate(amountMinor, rate);

			return formatMinorUnitsCurrency(toAmountMinor, target.currency);
		}
		catch {
			return undefined;
		}
	});

	createEffect(() => {
		if (!props.open) {
			return;
		}

		const transfer = props.transfer;

		if (props.mode === 'edit' && transfer) {
			setFromAccountId(transfer.fromAccountId);
			setToAccountId(transfer.toAccountId);
			setAmountInput(formatMinorUnitsAsInput(transfer.fromAmountMinor));
			setRateInput(transfer.exchangeRate);
			setHappenedOn(transfer.happenedOn);
			setContactId(transfer.contactId);
			setComment(transfer.comment);
			setLocalError(undefined);
			return;
		}

		setFromAccountId(null);
		setToAccountId(null);
		setAmountInput('');
		setRateInput('');
		setHappenedOn(formatLocalDateKey(new Date()));
		setContactId(null);
		setComment('');
		setLocalError(undefined);
	});

	const handleSubmit = async (event: Event) => {
		event.preventDefault();
		setLocalError(undefined);

		const fromId = fromAccountId();
		const toId = toAccountId();
		const amountMinor = parseOptionalMoneyInputToMinorUnits(amountInput());
		const rate = normalizeExchangeRate(rateInput());
		const date = tryParseLocalDateKey(happenedOn());

		if (fromId === null) {
			setLocalError('Выберите счёт списания.');
			return;
		}

		if (toId === null) {
			setLocalError('Выберите счёт зачисления.');
			return;
		}

		if (amountMinor === null || amountMinor === undefined || amountMinor <= 0) {
			setLocalError('Укажите сумму списания.');
			return;
		}

		if (rate === undefined) {
			setLocalError('Укажите курс обмена.');
			return;
		}

		if (date === undefined) {
			setLocalError('Укажите существующую дату.');
			return;
		}

		await props.onSubmit({
			comment: comment(),
			contactId: contactId(),
			exchangeRate: rate,
			fromAccountId: fromId,
			fromAmountMinor: amountMinor,
			happenedOn: happenedOn(),
			toAccountId: toId
		});
	};

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<form class={css.form} onSubmit={handleSubmit}>
					<Dialog.Header closeLabel='Закрыть перевод'>
						<Dialog.Title>
							{props.mode === 'edit' ? 'Редактировать перевод' : 'Перевод между счетами'}
						</Dialog.Title>
						<Dialog.Description>
							Сумма списывается с одного счёта и зачисляется на другой по указанному курсу.
							Перевод не влияет на статистику расходов.
						</Dialog.Description>
					</Dialog.Header>

					<Dialog.Body class={css.body}>
						<Combobox
							disabled={props.loading}
							error={props.fieldErrors?.fromAccountId}
							getOptionLabel={(option) => `${option.name} · ${option.currency}`}
							getOptionValue={(option) => option.id}
							label='Со счёта'
							options={accountOptions()}
							placeholder='Выберите счёт'
							searchPlaceholder='Название счёта'
							value={fromAccountId()}
							onChange={(value) => {
								setFromAccountId(value);
								const nextTo = toAccountId();
								const from = accountOptions().find((account) => account.id === value);

								if (
									from
									&& nextTo
									&& (
										nextTo === from.id
										|| accountOptions().find((account) => account.id === nextTo)?.currency
											=== from.currency
									)
								) {
									setToAccountId(null);
								}
							}}
						/>

						<Combobox
							disabled={props.loading || fromAccountId() === null}
							error={props.fieldErrors?.toAccountId}
							getOptionLabel={(option) => `${option.name} · ${option.currency}`}
							getOptionValue={(option) => option.id}
							label='На счёт'
							options={toAccountOptions()}
							placeholder={fromAccountId() === null
								? 'Сначала выберите счёт списания'
								: 'Выберите счёт'}
							searchPlaceholder='Название счёта'
							value={toAccountId()}
							onChange={(value) => setToAccountId(value)}
						/>

						<div class={css.row}>
							<TextField
								disabled={props.loading}
								error={props.fieldErrors?.fromAmountMinor}
								inputMode='decimal'
								label={fromAccount()
									? `Сумма (${fromAccount()?.currency ?? ''})`
									: 'Сумма списания'}
								placeholder='0,00'
								required
								value={amountInput()}
								onInput={(event) => setAmountInput(event.currentTarget.value)}
							/>

							<TextField
								disabled={props.loading}
								error={props.fieldErrors?.exchangeRate}
								inputMode='decimal'
								label='Курс'
								placeholder='3,015'
								required
								value={rateInput()}
								onInput={(event) => setRateInput(event.currentTarget.value)}
							/>
						</div>

						<div class={css.preview}>
							<span class={css.previewLabel}>К зачислению</span>
							<strong class={css.previewValue}>
								{creditPreview() ?? '—'}
							</strong>
						</div>

						<TextField
							disabled={props.loading}
							error={props.fieldErrors?.happenedOn}
							label='Дата'
							required
							type='date'
							value={happenedOn()}
							onInput={(event) => setHappenedOn(event.currentTarget.value)}
						/>

						<Combobox
							clearable
							disabled={props.loading}
							error={props.fieldErrors?.contactId}
							getOptionDisabled={(option) => option.archived}
							getOptionLabel={(option) => option.name}
							getOptionSearchText={(option) => `${option.name} ${option.legalName ?? ''}`}
							getOptionValue={(option) => option.id}
							label='Контакт'
							optional
							options={contactOptions()}
							placeholder='Не выбран'
							searchPlaceholder='Название или юридическое имя'
							value={contactId()}
							renderOption={(option) => <ContactOptionContent option={option}/>}
							renderValue={(option) => <ContactOptionContent compact option={option}/>}
							onChange={(value) => setContactId(value)}
						/>

						<TextField
							disabled={props.loading}
							error={props.fieldErrors?.comment}
							label='Комментарий'
							maxLength={1000}
							optional
							placeholder='Необязательно'
							value={comment()}
							onInput={(event) => setComment(event.currentTarget.value)}
						/>

						<Show when={localError() || props.error}>
							<p class={css.formError} role='alert'>
								{localError() ?? props.error}
							</p>
						</Show>
					</Dialog.Body>

					<Dialog.Footer class={css.footer}>
						<Show when={props.mode === 'edit' && props.onDelete}>
							<Button
								disabled={props.loading}
								startIcon={<Trash2 size={16}/>}
								type='button'
								variant='danger'
								onClick={() => void props.onDelete?.()}
							>
								Удалить
							</Button>
						</Show>
						<div class={css.footerActions}>
							<Dialog.Action closeOnClick intent='cancel'>
								Отмена
							</Dialog.Action>
							<Button loading={props.loading} type='submit'>
								{props.mode === 'edit' ? 'Сохранить' : 'Перевести'}
							</Button>
						</div>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	);
}

function ContactOptionContent(props: {
	option: ContactOption;
	compact?: boolean;
}) {
	return (
		<span class={cn(css.contactOption, props.compact && css.contactOptionCompact)}>
			<span
				aria-hidden='true'
				class={css.contactSwatch}
				style={{ 'background-color': props.option.color }}
			>
				{props.option.type === 'company'
					? <Building2 size={14}/>
					: <UserRound size={14}/>}
			</span>
			<span class={css.contactCopy}>
				<span class={css.contactName}>{props.option.name}</span>
				<Show when={props.option.legalName && !props.compact}>
					<span class={css.contactMeta}>{props.option.legalName}</span>
				</Show>
			</span>
		</span>
	);
}
