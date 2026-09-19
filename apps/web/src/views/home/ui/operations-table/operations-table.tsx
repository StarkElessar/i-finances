import css from './operations-table.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import type { GridColumn } from '@/shared/ui/grid';
import { Grid } from '@/shared/ui/grid';

import type { Account } from '@/entities/account';
import { CategoryIcon } from '@/entities/category';
import type {
	OperationGroup,
	OperationSort,
	OperationSortField,
	OperationWithBalance
} from '@/entities/operation';

import { Building2 } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createMemo, Show } from 'solid-js';

import { OperationGroupRow } from '../operation-group-row/operation-group-row';

const SORT_FIELDS: OperationSortField[] = ['date', 'amount', 'balance', 'category', 'contact'];

export type OperationsTableProps = {
	account: Account;
	emptyContent: string;
	groups: OperationGroup[];
	highlightOperationId?: string;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	selectedOperationId?: string;
	sort: OperationSort;
	onOperationSelect: (operation: OperationWithBalance) => void;
	onSortFieldChange: (columnId: string) => void;
};

type OperationTableGroupItem = {
	group: OperationGroup;
	kind: 'group';
};

type OperationTableOperationItem = {
	categoryColor: string;
	categoryIcon: string;
	kind: 'operation';
	operation: OperationWithBalance;
};

type OperationTableItem = OperationTableGroupItem | OperationTableOperationItem;

function isOperationSortField(value: string): value is OperationSortField {
	return SORT_FIELDS.includes(value as OperationSortField);
}

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

function getOperationItem(item: OperationTableItem): OperationTableOperationItem | undefined {
	return item.kind === 'operation' ? item : undefined;
}

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
							<span aria-hidden='true' class={css.categoryIcon}>
								<CategoryIcon icon={item().categoryIcon} size={14}/>
							</span>
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
	const tableItems = createMemo<OperationTableItem[]>(() => (
		props.groups.flatMap((group) => [
			{ group, kind: 'group' as const },
			...group.operations.map((operation) => ({
				categoryColor: props.resolveCategoryColor(operation),
				categoryIcon: props.resolveCategoryIcon(operation),
				kind: 'operation' as const,
				operation
			}))
		])
	));

	const handleSortFieldChange = (columnId: string) => {
		if (!isOperationSortField(columnId)) {
			return;
		}

		props.onSortFieldChange(columnId);
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
					resolveCategoryColor={props.resolveCategoryColor}
					resolveCategoryIcon={props.resolveCategoryIcon}
				/>
			);
		}

		return null;
	};

	return (
		<Grid
			aria-label={`Операции счёта «${props.account.name}»`}
			class={css.grid}
			columns={columns}
			data={tableItems()}
			emptyContent={props.emptyContent}
			fullWidthRowTemplate={({ dataItem }) => renderGroupRow(dataItem)}
			getRowAriaLabel={(item) => item.kind === 'operation'
				? `${item.operation.title}, ${formatMinorUnitsCurrency(
					item.operation.signedAmountMinor,
					item.operation.currency
				)}`
				: item.group.label}
			getRowClass={(item) => cn(
				item.kind === 'group' && css.groupHeaderRow,
				item.kind === 'operation'
					&& item.operation.id === props.highlightOperationId
					&& css.justCreatedRow
			)}
			getRowKey={(item) => item.kind === 'group' ? item.group.id : item.operation.id}
			isFullWidthRow={(item) => item.kind === 'group'}
			isRowSelected={(item) => (
				item.kind === 'operation' && item.operation.id === props.selectedOperationId
			)}
			sort={{ columnId: props.sort.field, direction: props.sort.direction }}
			onRowClick={handleTableRowClick}
			onSortChange={handleSortFieldChange}
		/>
	);
}
