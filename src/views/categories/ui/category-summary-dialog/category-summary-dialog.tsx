import css from './category-summary-dialog.module.scss';

import {
	cn,
	CurrencyCode,
	type CurrencyCodeValue,
	type CurrencyExchangeRates,
	formatDate,
	formatMinorUnitsCurrency
} from '~/shared/lib';
import { Button, Dialog } from '~/shared/ui';

import type { Category, PersistedCategory } from '~/entities/category';
import { toCurrencyExchangeRates } from '~/entities/exchange-rate';
import { getCurrentExchangeRates } from '~/entities/exchange-rate/api';
import type {
	CategoryOperation,
	OperationPeriodMode
} from '~/entities/operation';
import {
	canMoveToNextOperationPeriod,
	getCategoryOperations,
	getOperationBaseEquivalentMinor,
	getOperationPeriodRange,
	getSignedAccountAmountMinor,
	getSummaryPeriodFxTotals,
	parseLocalDateKey,
	shiftOperationPeriod
} from '~/entities/operation';

import { createAsync } from '@solidjs/router';
import {
	ChevronLeft,
	ChevronRight
} from 'lucide-solid';
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Show
} from 'solid-js';

import { CategoryOperationDialog } from '../category-operation-dialog';

/**
 * Controlled dialog that lists category operations for a selected period.
 */
export type CategorySummaryDialogProps = {
	categories: readonly PersistedCategory[];
	category: Category | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const PERIOD_MODES: OperationPeriodMode[] = ['week', 'month', 'year'];

const PERIOD_LABELS: Record<OperationPeriodMode, string> = {
	month: 'Месяц',
	week: 'Неделя',
	year: 'Год'
};

/**
 * Dialog with period controls and a chronological list of category operations.
 */
export function CategorySummaryDialog(props: CategorySummaryDialogProps) {
	const currentDate = new Date();
	const [periodMode, setPeriodMode] = createSignal<OperationPeriodMode>('month');
	const [periodAnchor, setPeriodAnchor] = createSignal(new Date());
	const [editingOperation, setEditingOperation] = createSignal<CategoryOperation>();
	const [isOperationDialogOpen, setIsOperationDialogOpen] = createSignal(false);

	const periodRange = createMemo(() => (
		getOperationPeriodRange(periodAnchor(), periodMode())
	));

	const operations = createAsync(async () => {
		const category = props.category;

		if (props.open && category) {
			return getCategoryOperations({
				categoryId: category.id,
				...periodRange()
			});
		}
	});

	const currentExchangeRates = createAsync(async () => {
		if (props.open) {
			return getCurrentExchangeRates();
		}
	});

	const items = () => operations()?.items ?? [];
	const isLoading = () => props.open && operations() === undefined;
	const periodCurrency = (): CurrencyCodeValue | undefined => (
		operations()?.householdBaseCurrency
	);
	const exchangeRates = createMemo(() => {
		const snapshot = currentExchangeRates();
		return snapshot ? toCurrencyExchangeRates(snapshot) : undefined;
	});
	const periodFxTotals = createMemo(() => {
		const baseCurrency = periodCurrency();

		if (baseCurrency === undefined) {
			return undefined;
		}

		return getSummaryPeriodFxTotals(items(), baseCurrency, exchangeRates());
	});

	const handleOpenChange = (open: boolean) => {
		if (!open && isOperationDialogOpen()) {
			return;
		}

		props.onOpenChange(open);
	};

	const handlePeriodModeChange = (mode: OperationPeriodMode) => {
		if (periodMode() !== mode) {
			setPeriodMode(mode);
		}
	};

	const handleMovePeriod = (offset: number) => {
		setPeriodAnchor((anchorDate) => (
			shiftOperationPeriod(anchorDate, periodMode(), offset)
		));
	};

	const handleOperationOpen = (operation: CategoryOperation) => {
		setEditingOperation(operation);
		setIsOperationDialogOpen(true);
	};

	const handleOperationDialogOpenChange = (open: boolean) => {
		setIsOperationDialogOpen(open);

		if (!open) {
			setEditingOperation(undefined);
		}
	};

	createEffect(() => {
		if (props.open && props.category) {
			setPeriodMode('month');
			setPeriodAnchor(new Date());
			setIsOperationDialogOpen(false);
			setEditingOperation(undefined);
		}
	});

	return (
		<>
			<Dialog.Root
				closeOnBackdropClick={!isOperationDialogOpen()}
				closeOnEscape={!isOperationDialogOpen()}
				open={props.open}
				onOpenChange={handleOpenChange}
			>
				<Dialog.Content class={css.dialog}>
					<Dialog.Header closeLabel='Закрыть сводку категории'>
						<Dialog.Kicker>Сводка</Dialog.Kicker>
						<Dialog.Title>{props.category?.name ?? 'Категория'}</Dialog.Title>
						<Dialog.Description>
							Операции категории за выбранный период
						</Dialog.Description>
					</Dialog.Header>

					<Dialog.Body class={css.body}>
						<div class={css.controls}>
							<div class={css.toolbar}>
								<div aria-label='Период' class={css.periodSwitch} role='group'>
									<For each={PERIOD_MODES}>
										{(mode) => (
											<button
												aria-pressed={periodMode() === mode}
												class={cn(
													css.periodButton,
													periodMode() === mode && css.periodButtonActive
												)}
												disabled={periodMode() === mode}
												type='button'
												onClick={() => handlePeriodModeChange(mode)}
											>
												{PERIOD_LABELS[mode]}
											</button>
										)}
									</For>
								</div>

								<div class={css.periodNavigation}>
									<Button
										aria-label='Предыдущий период'
										iconOnly
										size='sm'
										variant='ghost'
										onClick={() => handleMovePeriod(-1)}
									>
										<ChevronLeft size={18}/>
									</Button>
									<span class={css.periodLabel}>
										{formatPeriodLabel(periodAnchor(), periodMode())}
									</span>
									<Button
										aria-label='Следующий период'
										disabled={!canMoveToNextOperationPeriod(
											periodAnchor(),
											periodMode(),
											currentDate
										)}
										iconOnly
										size='sm'
										variant='ghost'
										onClick={() => handleMovePeriod(1)}
									>
										<ChevronRight size={18}/>
									</Button>
								</div>
							</div>

							<Show when={!isLoading() && periodFxTotals()}>
								{(totals) => (
									<div class={css.total}>
										<span class={css.totalLabel}>Итого за период</span>
										<div class={css.totalAmounts}>
											<span
												class={cn(
													css.totalAmount,
													totals().baseTotalMinor < 0 && css.amountExpense,
													totals().baseTotalMinor > 0 && css.amountIncome
												)}
											>
												{formatMinorUnitsCurrency(
													totals().baseTotalMinor,
													totals().baseCurrency
												)}
											</span>
											<Show when={typeof totals().usdTotalMinor === 'number' ? totals() : undefined}>
												{(value) => (
													<span class={css.totalAmountSecondary}>
														{formatMinorUnitsCurrency(
															value().usdTotalMinor as number,
															CurrencyCode.USD
														)}
													</span>
												)}
											</Show>
										</div>
									</div>
								)}
							</Show>
						</div>

						<div class={css.scrollArea}>
							<Show
								fallback={(
									<div aria-busy='true' class={css.emptyState} role='status'>
										Загрузка операций…
									</div>
								)}
								when={!isLoading()}
							>
								<Show
									fallback={(
										<div class={css.emptyState}>
											За выбранный период операций нет
										</div>
									)}
									when={items().length > 0}
								>
									<ul class={css.list}>
										<For each={items()}>
											{(item) => (
												<li class={css.item}>
													<CategoryOperationRow
														exchangeRates={exchangeRates()}
														householdBaseCurrency={periodCurrency()}
														operation={item}
														onOpen={() => handleOperationOpen(item)}
													/>
												</li>
											)}
										</For>
									</ul>
								</Show>
							</Show>
						</div>
					</Dialog.Body>

					<Dialog.Footer>
						<Dialog.Action closeOnClick intent='cancel'>
							Закрыть
						</Dialog.Action>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>

			<CategoryOperationDialog
				categories={props.categories}
				open={isOperationDialogOpen()}
				operation={editingOperation()}
				onOpenChange={handleOperationDialogOpenChange}
			/>
		</>
	);
}

type CategoryOperationRowProps = {
	exchangeRates: CurrencyExchangeRates | undefined;
	householdBaseCurrency: CurrencyCodeValue | undefined;
	operation: CategoryOperation;
	onOpen: () => void;
};

/**
 * Renders one clickable operation row inside the category summary list.
 */
function CategoryOperationRow(props: CategoryOperationRowProps) {
	const signedAmountMinor = () => getSignedAccountAmountMinor(props.operation);
	const baseEquivalentMinor = () => {
		const baseCurrency = props.householdBaseCurrency;

		if (baseCurrency === undefined) {
			return undefined;
		}

		return getOperationBaseEquivalentMinor(
			props.operation,
			baseCurrency,
			props.exchangeRates
		);
	};

	return (
		<button
			aria-label={`Редактировать операцию «${props.operation.title}»`}
			class={css.row}
			type='button'
			onClick={props.onOpen}
		>
			<div class={css.rowMain}>
				<div class={css.rowMeta}>
					<span class={css.date}>
						{formatDate(parseLocalDateKey(props.operation.happenedOn))}
					</span>
					<span class={css.account}>{props.operation.accountName}</span>
				</div>
				<span class={css.title}>{props.operation.title}</span>
				<Show when={props.operation.comment}>
					<span class={css.comment}>{props.operation.comment}</span>
				</Show>
			</div>
			<div class={css.amountColumn}>
				<span
					class={cn(
						css.amount,
						signedAmountMinor() < 0 && css.amountExpense,
						signedAmountMinor() > 0 && css.amountIncome
					)}
				>
					{formatMinorUnitsCurrency(signedAmountMinor(), props.operation.currency)}
				</span>
				<Show
					when={(() => {
						const equivalentMinor = baseEquivalentMinor();
						const baseCurrency = props.householdBaseCurrency;

						if (equivalentMinor === undefined || baseCurrency === undefined) {
							return undefined;
						}

						return {
							baseCurrency,
							equivalentMinor
						};
					})()}
				>
					{(value) => (
						<span class={css.amountSecondary}>
							{`≈ ${formatMinorUnitsCurrency(
								value().equivalentMinor,
								value().baseCurrency
							)}`}
						</span>
					)}
				</Show>
			</div>
		</button>
	);
}

/**
 * Formats the period navigation label for week, month, or year mode.
 */
function formatPeriodLabel(anchorDate: Date, mode: OperationPeriodMode): string {
	if (mode === 'year') {
		return String(anchorDate.getFullYear());
	}

	if (mode === 'month') {
		const value = new Intl.DateTimeFormat('ru-BY', {
			month: 'long',
			year: 'numeric'
		}).format(anchorDate);

		return value.charAt(0).toLocaleUpperCase('ru-BY') + value.slice(1);
	}

	const range = getOperationPeriodRange(anchorDate, mode);
	const startDate = parseLocalDateKey(range.start);
	const endDate = parseLocalDateKey(range.end);
	const start = new Intl.DateTimeFormat('ru-BY', {
		day: 'numeric',
		month: 'short'
	}).format(startDate);
	const end = new Intl.DateTimeFormat('ru-BY', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(endDate);

	return `${start} — ${end}`;
}
