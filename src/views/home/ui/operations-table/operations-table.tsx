import css from './operations-table.module.scss';

import { cn, formatDate, formatMinorUnitsCurrency } from '~/shared/lib';
import { Button } from '~/shared/ui/button';
import type { GridColumn } from '~/shared/ui/grid';
import { Grid } from '~/shared/ui/grid';
import { TextField } from '~/shared/ui/text-field';

import type { Account } from '~/entities/account';
import type { Category } from '~/entities/category';
import type {
	OperationGroup,
	OperationPeriodMode,
	OperationSort,
	OperationSortField,
	OperationWithBalance
} from '~/entities/operation';
import {
	canMoveToNextOperationPeriod,
	createOperationGroups,
	filterOperationRows,
	getAccountLedger,
	getOperationPeriodRange,
	parseLocalDateKey
} from '~/entities/operation';

import { createAsync } from '@solidjs/router';
import {
	ArrowDownRight,
	ArrowDownWideNarrow,
	ArrowLeftRight,
	ArrowUpNarrowWide,
	ArrowUpRight,
	Building2,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	CircleDollarSign,
	Minus,
	Plus,
	Search,
	WalletCards,
	X
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createMemo, createSignal, For, Show } from 'solid-js';

type OperationsTableProps = {
	account: Account;
	categories: readonly Category[];
	/** Canonical period start date key from the route (`YYYY-MM-DD`). */
	periodFrom: string;
	/** Controlled period display mode from the route search string. */
	periodMode: OperationPeriodMode;
	selectedOperationId?: string;
	onCreateOperation: () => void;
	onCreateTransfer: () => void;
	onOperationSelect: (operation: OperationWithBalance) => void;
	/** Notifies the parent when the user switches week/month/year. */
	onPeriodModeChange: (mode: OperationPeriodMode) => void;
	/** Notifies the parent when the user moves to an adjacent period. */
	onPeriodMove: (offset: number) => void;
};

type OperationTableGroupItem = {
	group: OperationGroup;
	kind: 'group';
};

type OperationTableOperationItem = {
	categoryColor: string;
	kind: 'operation';
	operation: OperationWithBalance;
};

type OperationTableItem = OperationTableGroupItem | OperationTableOperationItem;

const PERIOD_LABELS: Record<OperationPeriodMode, string> = {
	month: 'Месяц',
	week: 'Неделя',
	year: 'Год'
};

const PERIOD_MODES: OperationPeriodMode[] = ['week', 'month', 'year'];
const SORT_FIELDS: OperationSortField[] = ['date', 'amount', 'balance', 'category', 'contact'];
const FALLBACK_CATEGORY_COLOR = '#778398';

const columns: GridColumn<OperationTableItem>[] = [
	{
		accessor: (item) => item.kind === 'operation' ? formatShortDate(item.operation.happenedOn) : '',
		header: 'Дата',
		id: 'date',
		minWidth: 104,
		sortable: true,
		width: 112,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => <span class={css.dateCell}>{formatShortDate(item().operation.happenedOn)}</span>}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.title : '',
		header: 'Название',
		id: 'title',
		minWidth: 210,
		width: 280,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => (
					<span class={css.titleCell} title={item().operation.title}>
						{item().operation.title}
					</span>
				)}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.signedAmountMinor : '',
		header: 'Сумма',
		id: 'amount',
		minWidth: 118,
		sortable: true,
		width: 132,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => (
					<span
						class={cn(
							css.moneyCell,
							item().operation.type === 'income' ? css.income : css.expense
						)}
					>
						{formatMinorUnitsCurrency(
							item().operation.signedAmountMinor,
							item().operation.currency
						)}
					</span>
				)}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.balanceAfterMinor : '',
		header: 'Баланс счёта',
		id: 'balance',
		minWidth: 132,
		sortable: true,
		width: 148,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => (
					<span class={css.balanceCell}>
						{formatMinorUnitsCurrency(
							item().operation.balanceAfterMinor,
							item().operation.currency
						)}
					</span>
				)}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.categoryName : '',
		header: 'Категория',
		id: 'category',
		minWidth: 152,
		sortable: true,
		width: 188,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => {
					const label = () => item().operation.transferId
						? 'Перевод'
						: item().operation.categoryName ?? 'Без категории';

					return (
						<span
							class={css.referenceCell}
							style={{ '--reference-color': item().categoryColor }}
							title={label()}
						>
							<span aria-hidden='true' class={css.categoryIcon}><span/></span>
							<span>{label()}</span>
						</span>
					);
				}}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.contactName : '',
		header: 'Контакт',
		id: 'contact',
		minWidth: 180,
		sortable: true,
		width: 244,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => (
					<span
						class={css.referenceCell}
						title={item().operation.contactName ?? 'Без контакта'}
					>
						<Building2 aria-hidden='true' size={15}/>
						<span>{item().operation.contactName ?? 'Без контакта'}</span>
					</span>
				)}
			</Show>
		)
	},
	{
		accessor: (item) => item.kind === 'operation' ? item.operation.comment : '',
		header: 'Комментарий',
		id: 'comment',
		minWidth: 170,
		width: 230,
		clientTemplate: ({ dataItem }) => (
			<Show when={getOperationItem(dataItem)}>
				{(item) => (
					<span
						class={cn(css.commentCell, !item().operation.comment && css.emptyValue)}
						title={item().operation.comment || undefined}
					>
						{item().operation.comment || '—'}
					</span>
				)}
			</Show>
		)
	}
];

export function OperationsTable(props: OperationsTableProps) {
	let searchInput: HTMLInputElement | undefined;
	const currentDate = new Date();
	const [sort, setSort] = createSignal<OperationSort>({ direction: 'desc', field: 'date' });
	const [isSearchOpen, setIsSearchOpen] = createSignal(false);
	const [searchQuery, setSearchQuery] = createSignal('');

	const periodAnchor = createMemo(() => parseLocalDateKey(props.periodFrom));
	const periodRange = createMemo(() => (
		getOperationPeriodRange(periodAnchor(), props.periodMode)
	));
	const ledger = createAsync(() => getAccountLedger({
		accountId: props.account.id,
		...periodRange()
	}));
	const accountRows = () => ledger()?.items ?? [];
	const visibleRows = createMemo(() => (
		filterOperationRows(accountRows(), periodRange(), searchQuery())
	));
	const groups = createMemo(() => (
		createOperationGroups(visibleRows(), accountRows(), sort())
	));
	const categoryColorById = createMemo(() => {
		const colorById = new Map<string, string>();

		props.categories.forEach((category) => colorById.set(category.id, category.color));

		return colorById;
	});
	const categoryColorByName = createMemo(() => {
		const colorByName = new Map<string, string>();

		props.categories.forEach((category) => colorByName.set(category.name, category.color));

		return colorByName;
	});
	const resolveCategoryColor = (operation: OperationWithBalance): string => {
		if (operation.categoryId) {
			const colorById = categoryColorById().get(operation.categoryId);

			if (colorById) {
				return colorById;
			}
		}

		return operation.categoryName
			? categoryColorByName().get(operation.categoryName) ?? FALLBACK_CATEGORY_COLOR
			: FALLBACK_CATEGORY_COLOR;
	};
	const tableItems = createMemo<OperationTableItem[]>(() => (
		groups().flatMap((group) => [
			{ group, kind: 'group' as const },
			...group.operations.map((operation) => ({
				categoryColor: resolveCategoryColor(operation),
				kind: 'operation' as const,
				operation
			}))
		])
	));

	const handleSortDirectionChange = () => {
		setSort((currentSort) => ({
			...currentSort,
			direction: currentSort.direction === 'desc' ? 'asc' : 'desc'
		}));
	};

	const handleSortFieldChange = (columnId: string) => {
		if (!isOperationSortField(columnId) || sort().field === columnId) {
			return;
		}

		setSort({
			direction: columnId === 'date' ? 'desc' : 'asc',
			field: columnId
		});
	};

	const handlePeriodModeChange = (mode: OperationPeriodMode) => {
		if (props.periodMode !== mode) {
			props.onPeriodModeChange(mode);
		}
	};

	const handleMovePeriod = (offset: number) => {
		props.onPeriodMove(offset);
	};

	const handleOpenSearch = () => {
		setIsSearchOpen(true);
		queueMicrotask(() => searchInput?.focus());
	};

	const handleCloseSearch = () => {
		setSearchQuery('');
		setIsSearchOpen(false);
	};

	const handleSearchKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			handleCloseSearch();
		}
	};

	const handleTableRowClick = (item: OperationTableItem) => {
		if (item.kind === 'operation') {
			props.onOperationSelect(item.operation);
		}
	};

	const renderGroupRow = (item: OperationTableItem): JSX.Element => {
		if (item.kind === 'group') {
			return (
				<OperationGroupRow
					group={item.group}
					resolveCategoryColor={resolveCategoryColor}
				/>
			);
		}

		return null;
	};

	return (
		<section
			aria-busy={ledger() === undefined}
			aria-label='Операции счёта'
			class={css.root}
		>
			<div class={css.toolbar}>
				<div class={css.toolbarGroup}>
					<Button
						aria-label={sort().direction === 'desc'
							? 'Показать в обратном порядке'
							: 'Показать в прямом порядке'}
						iconOnly
						size='sm'
						title={sort().direction === 'desc' ? 'По убыванию' : 'По возрастанию'}
						variant='secondary'
						onClick={handleSortDirectionChange}
					>
						<Show
							fallback={<ArrowUpNarrowWide size={17}/>}
							when={sort().direction === 'desc'}
						>
							<ArrowDownWideNarrow size={17}/>
						</Show>
					</Button>
					<div aria-label='Период' class={css.periodSwitch} role='group'>
						<For each={PERIOD_MODES}>
							{(mode) => (
								<button
									aria-pressed={props.periodMode === mode}
									class={cn(css.periodButton, props.periodMode === mode && css.periodButtonActive)}
									disabled={props.periodMode === mode}
									type='button'
									onClick={() => handlePeriodModeChange(mode)}
								>
									{PERIOD_LABELS[mode]}
								</button>
							)}
						</For>
					</div>
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
					<span class={css.periodLabel}>{formatPeriodLabel(periodAnchor(), props.periodMode)}</span>
					<Button
						aria-label='Следующий период'
						disabled={!canMoveToNextOperationPeriod(periodAnchor(), props.periodMode, currentDate)}
						iconOnly
						size='sm'
						variant='ghost'
						onClick={() => handleMovePeriod(1)}
					>
						<ChevronRight size={18}/>
					</Button>
				</div>

				<div class={cn(css.toolbarGroup, css.toolbarActions)}>
					<Show when={!isSearchOpen()}>
						<Button
							aria-label='Открыть поиск'
							iconOnly
							size='sm'
							variant='ghost'
							onClick={handleOpenSearch}
						>
							<Search size={18}/>
						</Button>
					</Show>
					<Button
						aria-label='Добавить перевод'
						iconOnly
						size='sm'
						variant='secondary'
						onClick={props.onCreateTransfer}
					>
						<ArrowLeftRight size={18}/>
					</Button>
					<Button
						aria-label='Добавить операцию'
						iconOnly
						size='sm'
						variant='primary'
						onClick={props.onCreateOperation}
					>
						<Plus size={18}/>
					</Button>
				</div>
			</div>

			<Show when={isSearchOpen()}>
				<div class={css.searchRow}>
					<TextField
						ref={(element) => {
							searchInput = element;
						}}
						aria-label='Поиск операций'
						class={css.searchField}
						placeholder='Название, комментарий, категория, получатель или сумма'
						size='sm'
						startContent={<Search size={16}/>}
						value={searchQuery()}
						onInput={(event) => setSearchQuery(event.currentTarget.value)}
						onKeyDown={handleSearchKeyDown}
					/>
					<Button
						aria-label='Закрыть поиск'
						iconOnly
						size='sm'
						variant='ghost'
						onClick={handleCloseSearch}
					>
						<X size={17}/>
					</Button>
				</div>
			</Show>

			<Grid
				aria-label={`Операции счёта «${props.account.name}»`}
				class={css.grid}
				columns={columns}
				data={tableItems()}
				emptyContent={ledger() === undefined
					? 'Загрузка операций…'
					: searchQuery()
						? 'По вашему запросу ничего не найдено'
						: 'В этом периоде операций нет'}
				fullWidthRowTemplate={({ dataItem }) => renderGroupRow(dataItem)}
				getRowAriaLabel={(item) => item.kind === 'operation'
					? `${item.operation.title}, ${formatMinorUnitsCurrency(
						item.operation.signedAmountMinor,
						item.operation.currency
					)}`
					: item.group.label}
				getRowClass={(item) => item.kind === 'group' ? css.groupHeaderRow : undefined}
				getRowKey={(item) => item.kind === 'group' ? item.group.id : item.operation.id}
				isFullWidthRow={(item) => item.kind === 'group'}
				isRowSelected={(item) => (
					item.kind === 'operation' && item.operation.id === props.selectedOperationId
				)}
				sort={{ columnId: sort().field, direction: sort().direction }}
				onRowClick={handleTableRowClick}
				onSortChange={handleSortFieldChange}
			/>
		</section>
	);
}

function OperationGroupRow(props: {
	group: OperationGroup;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
}) {
	const currency = () => props.group.operations[0]?.currency;
	const categoryColor = () => {
		const operation = props.group.operations[0];

		return props.resolveCategoryColor(operation);
	};
	const groupStyle = (): JSX.CSSProperties => ({ '--group-color': categoryColor() });

	return (
		<div class={css.groupRow} style={groupStyle()}>
			<span class={css.groupHeading}>
				<GroupIcon group={props.group}/>
				<span>{formatGroupLabel(props.group)}</span>
			</span>
			<Show when={props.group.type === 'date' && currency()}>
				{(resolvedCurrency) => (
					<span class={css.groupBalance}>
						<span>{formatMinorUnitsCurrency(
							props.group.openingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<BalanceDirection differenceMinor={props.group.differenceMinor ?? 0}/>
						<span>{formatMinorUnitsCurrency(
							props.group.closingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<span
							class={cn(
								css.groupDifference,
								(props.group.differenceMinor ?? 0) > 0 && css.groupDifferencePositive,
								(props.group.differenceMinor ?? 0) < 0 && css.groupDifferenceNegative
							)}
						>
							({formatMinorUnitsCurrency(
								props.group.differenceMinor ?? 0,
								resolvedCurrency(),
								{ signDisplay: 'always' }
							)})
						</span>
					</span>
				)}
			</Show>
			<span class={css.groupCount}>{props.group.operations.length}</span>
		</div>
	);
}

function GroupIcon(props: { group: OperationGroup }) {
	if (props.group.type === 'date') {
		return <CalendarDays aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'category') {
		return <span aria-hidden='true' class={css.groupCategoryIcon}><span/></span>;
	}

	if (props.group.type === 'contact') {
		return <Building2 aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'amount') {
		return <CircleDollarSign aria-hidden='true' size={15}/>;
	}

	return <WalletCards aria-hidden='true' size={15}/>;
}

function BalanceDirection(props: { differenceMinor: number }) {
	if (props.differenceMinor > 0) {
		return <ArrowUpRight aria-label='Баланс увеличился' class={css.balanceUp} size={17}/>;
	}

	if (props.differenceMinor < 0) {
		return <ArrowDownRight aria-label='Баланс уменьшился' class={css.balanceDown} size={17}/>;
	}

	return <Minus aria-label='Баланс не изменился' class={css.balanceNeutral} size={17}/>;
}

function getOperationItem(item: OperationTableItem): OperationTableOperationItem | undefined {
	return item.kind === 'operation' ? item : undefined;
}

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

function formatGroupLabel(group: OperationGroup): string {
	return group.type === 'date' ? formatDate(parseLocalDateKey(group.label)) : group.label;
}

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
	const start = new Intl.DateTimeFormat('ru-BY', { day: 'numeric', month: 'short' }).format(startDate);
	const end = new Intl.DateTimeFormat('ru-BY', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(endDate);

	return `${start} — ${end}`;
}

function isOperationSortField(value: string): value is OperationSortField {
	return SORT_FIELDS.includes(value as OperationSortField);
}
