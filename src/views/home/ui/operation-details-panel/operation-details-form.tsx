import css from './operation-details-panel.module.scss';

import {
	cn,
	formatMinorUnitsAsInput,
	formatMinorUnitsCurrency,
	parseOptionalMoneyInputToMinorUnits
} from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import { Combobox } from '~/shared/ui/combobox';
import { Dialog } from '~/shared/ui/dialog';
import { TextField } from '~/shared/ui/text-field';

import {
	CategoryIcon,
	DEFAULT_CATEGORY_ICON_ID,
	findSuggestedCategory,
	resolveCategoryIconId
} from '~/entities/category';
import type { ContactType } from '~/entities/contact';
import {
	formatLocalDateKey,
	type OperationType,
	tryParseLocalDateKey
} from '~/entities/operation';

import {
	Building2,
	ChevronLeft,
	ChevronRight,
	RefreshCw,
	Trash2,
	UserRound,
	X
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	Show
} from 'solid-js';

import type { OperationDetailsPanelProps } from './types';

type OperationDetailsFormProps = Pick<
	OperationDetailsPanelProps,
	| 'account'
	| 'categories'
	| 'contacts'
	| 'error'
	| 'fieldErrors'
	| 'loading'
	| 'mode'
	| 'onDelete'
	| 'onRecalculateRate'
	| 'onSubmit'
	| 'operation'
> & {
	onClose: () => void;
	titleId: string;
};

type CategoryOption = {
	color: string;
	disabled: boolean;
	icon: string;
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
 * Owns transaction draft state, validation and domain-specific form controls.
 */
export function OperationDetailsForm(props: OperationDetailsFormProps) {
	let amountInput: HTMLInputElement | undefined;
	const commentId = createUniqueId();
	const [amount, setAmount] = createSignal('');
	const [amountError, setAmountError] = createSignal<string>();
	const [categoryId, setCategoryId] = createSignal<string | null>(null);
	const [categoryWasSelectedManually, setCategoryWasSelectedManually] = createSignal(false);
	const [comment, setComment] = createSignal('');
	const [contactId, setContactId] = createSignal<string | null>(null);
	const [happenedOn, setHappenedOn] = createSignal(formatLocalDateKey(new Date()));
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = createSignal(false);
	const [title, setTitle] = createSignal('');
	const [type, setType] = createSignal<OperationType>('expense');

	const isEditMode = () => props.mode === 'edit';
	const usesExchangeRate = () => (
		props.operation?.exchangeRate.fromCurrency
		!== props.operation?.exchangeRate.toCurrency
	);
	const parsedAmount = () => parseOptionalMoneyInputToMinorUnits(amount());
	const canSubmit = () => (
		Boolean(title().trim())
		&& Boolean(happenedOn())
		&& typeof parsedAmount() === 'number'
		&& (parsedAmount() as number) > 0
		&& !props.loading
	);
	const signedPreviewAmount = () => {
		const parsedValue = parsedAmount();

		if (typeof parsedValue !== 'number') {
			return 0;
		}

		return type() === 'expense' ? -parsedValue : parsedValue;
	};
	const categoryOptions = createMemo<CategoryOption[]>(() => {
		const options = props.categories.map((category) => ({
			color: category.color,
			disabled: false,
			icon: resolveCategoryIconId(category.icon),
			id: category.id,
			name: category.name
		}));
		const operation = props.operation;

		if (
			operation?.categoryId
			&& operation.categoryName
			&& !options.some((option) => option.id === operation.categoryId)
		) {
			options.push({
				color: '#7d8799',
				disabled: true,
				icon: DEFAULT_CATEGORY_ICON_ID,
				id: operation.categoryId,
				name: operation.categoryName
			});
		}

		return options;
	});
	const contactOptions = createMemo<ContactOption[]>(() => {
		const options = props.contacts
			.filter((contact) => (
				contact.archivedAt === null
				|| contact.id === props.operation?.contactId
			))
			.map((contact) => ({
				archived: contact.archivedAt !== null,
				color: contact.color,
				id: contact.id,
				legalName: contact.legalName,
				name: contact.name,
				type: contact.type
			}));
		const operation = props.operation;

		if (
			operation?.contactId
			&& operation.contactName
			&& !options.some((option) => option.id === operation.contactId)
		) {
			options.push({
				archived: true,
				color: '#7d8799',
				id: operation.contactId,
				legalName: null,
				name: operation.contactName,
				type: 'unknown'
			});
		}

		return options;
	});

	const resetForm = (): void => {
		const operation = props.operation;

		if (isEditMode() && operation) {
			setAmount(formatMinorUnitsAsInput(operation.amountMinor));
			setCategoryId(operation.categoryId);
			setCategoryWasSelectedManually(operation.categoryId !== null);
			setComment(operation.comment);
			setContactId(operation.contactId);
			setHappenedOn(operation.happenedOn);
			setTitle(operation.title);
			setType(operation.type);
		}
		else {
			setAmount('');
			setCategoryId(null);
			setCategoryWasSelectedManually(false);
			setComment('');
			setContactId(null);
			setHappenedOn(formatLocalDateKey(new Date()));
			setTitle('');
			setType('expense');
		}

		setAmountError(undefined);
		setIsDeleteDialogOpen(false);
		queueMicrotask(() => amountInput?.focus());
	};

	const handleTitleInput: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
		const nextTitle = event.currentTarget.value;

		setTitle(nextTitle);

		if (!categoryWasSelectedManually() || categoryId() === null) {
			setCategoryWasSelectedManually(false);
			setCategoryId(findSuggestedCategory(props.categories, nextTitle)?.id ?? null);
		}
	};

	const handleCategoryChange = (value: string | null): void => {
		setCategoryId(value);
		setCategoryWasSelectedManually(true);
	};

	const handleAmountInput: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
		setAmount(event.currentTarget.value);
		setAmountError(undefined);
	};

	const handleDateShift = (offset: number): void => {
		const date = tryParseLocalDateKey(happenedOn()) ?? new Date();

		date.setDate(date.getDate() + offset);
		setHappenedOn(formatLocalDateKey(date));
	};

	const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
		event.preventDefault();
		const amountMinor = parsedAmount();

		if (amountMinor === null) {
			setAmountError('Укажите сумму операции');
		}
		else if (amountMinor === undefined || amountMinor <= 0) {
			setAmountError('Введите положительную сумму с двумя знаками после запятой');
		}

		if (
			typeof amountMinor !== 'number'
			|| amountMinor <= 0
			|| !title().trim()
			|| !happenedOn()
		) {
			return;
		}

		props.onSubmit({
			amountMinor,
			categoryId: categoryId(),
			comment: comment(),
			contactId: contactId(),
			happenedOn: happenedOn(),
			title: title(),
			type: type()
		});
	};

	const handleConfirmDelete = (): void => {
		if (props.operation) {
			setIsDeleteDialogOpen(false);
			props.onDelete();
		}
	};

	createEffect(() => {
		resetForm();
	});

	return (
		<>
			<form class={css.form} onSubmit={handleSubmit}>
				<header class={css.header}>
					<div class={css.headerContent}>
						<div class={css.kicker}>{props.account.name}</div>
						<h2 class={css.title} id={props.titleId}>
							{isEditMode() ? 'Редактирование операции' : 'Новая операция'}
						</h2>
						<div
							class={cn(
								css.amountPreview,
								type() === 'income' ? css.amountIncome : css.amountExpense
							)}
						>
							{formatMinorUnitsCurrency(
								signedPreviewAmount(),
								props.account.currency,
								{ signDisplay: signedPreviewAmount() === 0 ? 'never' : 'auto' }
							)}
						</div>
					</div>
					<Button
						aria-label='Закрыть панель'
						iconOnly
						size='sm'
						variant='ghost'
						onClick={props.onClose}
					>
						<X size={18}/>
					</Button>
				</header>

				<div class={css.body}>
					<div aria-label='Тип операции' class={css.typeSwitch} role='group'>
						<button
							aria-pressed={type() === 'expense'}
							class={cn(css.typeButton, type() === 'expense' && css.typeButtonActive)}
							disabled={props.loading || type() === 'expense'}
							tabIndex={type() === 'expense' ? -1 : 0}
							type='button'
							onClick={() => setType('expense')}
						>
							Расход
						</button>
						<button
							aria-pressed={type() === 'income'}
							class={cn(css.typeButton, type() === 'income' && css.typeButtonActive)}
							disabled={props.loading || type() === 'income'}
							tabIndex={type() === 'income' ? -1 : 0}
							type='button'
							onClick={() => setType('income')}
						>
							Приход
						</button>
					</div>

					<div class={css.dateField}>
						<TextField
							disabled={props.loading}
							error={props.fieldErrors?.happenedOn}
							label='Дата'
							required
							type='date'
							value={happenedOn()}
							onInput={(event) => setHappenedOn(event.currentTarget.value)}
						/>
						<div class={css.dateActions}>
							<Button
								aria-label='Предыдущий день'
								disabled={props.loading}
								iconOnly
								size='sm'
								variant='ghost'
								onClick={() => handleDateShift(-1)}
							>
								<ChevronLeft size={18}/>
							</Button>
							<Button
								aria-label='Следующий день'
								disabled={props.loading}
								iconOnly
								size='sm'
								variant='ghost'
								onClick={() => handleDateShift(1)}
							>
								<ChevronRight size={18}/>
							</Button>
						</div>
					</div>

					<TextField
						ref={amountInput}
						disabled={props.loading}
						error={amountError() ?? props.fieldErrors?.amountMinor}
						inputMode='decimal'
						label='Сумма'
						placeholder='0,00'
						required
						value={amount()}
						endContent={props.account.currency}
						onInput={handleAmountInput}
					/>

					<Show when={isEditMode() && usesExchangeRate() && props.operation}>
						{(operation) => (
							<div class={css.rateField}>
								<div>
									<span class={css.rateLabel}>Курс операции</span>
									<strong>
										1 {operation().exchangeRate.fromCurrency}
										{' = '}
										{operation().exchangeRate.rate}
										{' '}
										{operation().exchangeRate.toCurrency}
									</strong>
									<span class={css.rateHint}>
										{operation().exchangeRate.effectiveOn}
										{' · '}
										{operation().exchangeRate.source}
									</span>
								</div>
								<Button
									aria-label='Пересчитать курс операции'
									disabled={props.loading}
									iconOnly
									size='sm'
									title='Пересчитать по таблице курсов'
									type='button'
									variant='ghost'
									onClick={props.onRecalculateRate}
								>
									<RefreshCw size={17}/>
								</Button>
							</div>
						)}
					</Show>

					<TextField
						disabled={props.loading}
						error={props.fieldErrors?.title}
						label='Название'
						maxLength={160}
						placeholder='Например, Продукты на неделю'
						required
						value={title()}
						onInput={handleTitleInput}
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

					<Combobox
						clearable
						disabled={props.loading}
						error={props.fieldErrors?.categoryId}
						getOptionDisabled={(option) => option.disabled}
						getOptionLabel={(option) => option.name}
						getOptionValue={(option) => option.id}
						label='Категория'
						optional
						options={categoryOptions()}
						placeholder='Не выбрана'
						searchPlaceholder='Название категории'
						value={categoryId()}
						renderOption={(option) => <CategoryOptionContent option={option}/>}
						renderValue={(option) => <CategoryOptionContent compact option={option}/>}
						onChange={handleCategoryChange}
					/>

					<div class={css.commentField}>
						<div class={css.labelRow}>
							<label class={css.label} for={commentId}>Комментарий</label>
							<span class={css.optional}>необязательно</span>
						</div>
						<textarea
							class={css.textarea}
							disabled={props.loading}
							id={commentId}
							maxLength={1000}
							placeholder='Дополнительные сведения об операции'
							rows={4}
							value={comment()}
							onInput={(event) => setComment(event.currentTarget.value)}
						/>
					</div>
					<Show when={props.error}>
						<p class={css.formError} role='alert'>{props.error}</p>
					</Show>
				</div>

				<footer class={css.footer}>
					<Show when={isEditMode() && props.operation}>
						<Button
							aria-label='Удалить операцию'
							class={css.deleteButton}
							disabled={props.loading}
							iconOnly
							title='Удалить операцию'
							type='button'
							variant='ghost'
							onClick={() => setIsDeleteDialogOpen(true)}
						>
							<Trash2 size={18}/>
						</Button>
					</Show>
					<span class={css.footerSpacer}/>
					<Button
						disabled={props.loading}
						type='button'
						variant='secondary'
						onClick={props.onClose}
					>
						Отмена
					</Button>
					<Button
						disabled={!canSubmit()}
						loading={props.loading}
						type='submit'
					>
						{isEditMode() ? 'Сохранить' : 'Добавить'}
					</Button>
				</footer>
			</form>

			<Dialog.Root
				class={css.deleteDialog}
				open={isDeleteDialogOpen()}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<Dialog.Content class={css.deleteDialogContent}>
					<Dialog.Header closeLabel='Закрыть подтверждение удаления'>
						<Dialog.Title>Удалить операцию?</Dialog.Title>
						<Dialog.Description>
							Операция будет исключена из баланса и статистики, но сохранится в истории.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Body>
						<div class={css.deleteSummary}>
							<strong>{props.operation?.title}</strong>
							<span>{props.operation && formatMinorUnitsCurrency(
								props.operation.type === 'expense'
									? -props.operation.amountMinor
									: props.operation.amountMinor,
								props.operation.currency
							)}</span>
						</div>
					</Dialog.Body>
					<Dialog.Footer>
						<Dialog.Action closeOnClick intent='cancel'>Отмена</Dialog.Action>
						<Button
							loading={props.loading}
							type='button'
							variant='danger'
							onClick={handleConfirmDelete}
						>
							Удалить
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		</>
	);
}

function CategoryOptionContent(props: { compact?: boolean; option: CategoryOption }) {
	const style = (): JSX.CSSProperties => ({ '--option-color': props.option.color });

	return (
		<span class={css.optionLayout} style={style()}>
			<span aria-hidden='true' class={css.categoryIcon}>
				<CategoryIcon icon={props.option.icon} size={16}/>
			</span>
			<span class={css.optionText}>
				<strong>{props.option.name}</strong>
				<Show when={!props.compact && props.option.disabled}>
					<span>Недоступна</span>
				</Show>
			</span>
		</span>
	);
}

function ContactOptionContent(props: { compact?: boolean; option: ContactOption }) {
	const style = (): JSX.CSSProperties => ({ '--option-color': props.option.color });

	return (
		<span class={css.optionLayout} style={style()}>
			<span aria-hidden='true' class={css.contactIcon}>
				<Show fallback={<UserRound size={16}/>} when={props.option.type === 'company'}>
					<Building2 size={16}/>
				</Show>
			</span>
			<span class={css.optionText}>
				<strong>{props.option.name}</strong>
				<Show when={!props.compact && (props.option.legalName || props.option.archived)}>
					<span>
						{props.option.archived ? 'В архиве' : props.option.legalName}
					</span>
				</Show>
			</span>
		</span>
	);
}
