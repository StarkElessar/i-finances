import css from './operations-table.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import type { GridColumn } from '@/shared/ui/grid';
import { Grid } from '@/shared/ui/grid';

import type { Account } from '@/entities/account';
import { CategoryIcon } from '@/entities/category';
import type {
	OperationSort,
	OperationSortField,
	OperationWithBalance
} from '@/entities/operation';

import { Building2 } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import type { OperationVirtualItem, OperationVirtualItems } from '../../model/operation-virtual-items';
import { OperationGroupRow } from '../operation-group-row/operation-group-row';
import { useOperationVirtualizer } from '../operations-workspace/lib/use-operation-virtualizer';

const SORT_FIELDS: OperationSortField[] = ['date', 'amount', 'balance', 'category', 'contact'];

export type OperationsTableProps = {
	account: Account;
	emptyContent: string;
	rows: OperationVirtualItems;
	scrollResetKey: string;
	highlightOperationId?: string;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	selectedOperationId?: string;
	sort: OperationSort;
	onOperationSelect: (operation: OperationWithBalance) => void;
	onSortFieldChange: (columnId: string) => void;
};

type OperationTableOperationItem = Extract<OperationVirtualItem, { kind: 'operation' }>;

function isOperationSortField(value: string): value is OperationSortField {
	return SORT_FIELDS.includes(value as OperationSortField);
}

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

function getOperationItem(item: OperationVirtualItem): OperationTableOperationItem | undefined {
	return item.kind === 'operation' ? item : undefined;
}

function createColumns(props: OperationsTableProps): GridColumn<OperationVirtualItem>[] {
	return [
		{
			accessor: (item) => item.kind === 'operation' ? formatShortDate(item.operation.happenedOn) : '',
			header: 'Дата',
			id: 'date',
			minWidth: 96,
			sortable: true,
			width: 104,
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
			minWidth: 120,
			width: 160,
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
			minWidth: 100,
			sortable: true,
			width: 104,
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
			class: css.columnWide,
			minWidth: 110,
			sortable: true,
			width: 120,
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
			class: css.columnCategory,
			minWidth: 140,
			sortable: true,
			width: 160,
			clientTemplate: ({ dataItem }) => (
				<Show when={getOperationItem(dataItem)}>
					{(item) => {
						const label = () => item().operation.transferId
							? 'Перевод'
							: item().operation.categoryName ?? 'Без категории';

						return (
							<span
								class={css.referenceCell}
								style={{ '--reference-color': props.resolveCategoryColor(item().operation) }}
								title={label()}
							>
								<span aria-hidden='true' class={css.categoryIcon}>
									<CategoryIcon icon={props.resolveCategoryIcon(item().operation)} size={14}/>
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
			class: css.columnContact,
			minWidth: 120,
			sortable: true,
			width: 150,
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
			class: css.columnWide,
			minWidth: 140,
			width: 180,
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
}

export function OperationsTable(props: OperationsTableProps) {
	const columns = createColumns(props);
	const { scrollMargin, setScrollElement, virtualizer } = useOperationVirtualizer<HTMLTableRowElement>({
		density: 'compact',
		get highlightOperationId() {
			return props.highlightOperationId;
		},
		get rows() {
			return props.rows;
		},
		get scrollResetKey() {
			return props.scrollResetKey;
		},
		get selectedOperationId() {
			return props.selectedOperationId;
		}
	});

	const handleSortFieldChange = (columnId: string) => {
		if (!isOperationSortField(columnId)) {
			return;
		}

		props.onSortFieldChange(columnId);
	};

	const handleTableRowClick = (item: OperationVirtualItem) => {
		if (item.kind === 'operation') {
			props.onOperationSelect(item.operation);
		}
	};

	const renderGroupRow = (item: OperationVirtualItem): JSX.Element => {
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
			aria-rowcount={props.rows.items.length + 1}
			class={css.grid}
			columns={columns}
			data={props.rows.items}
			emptyContent={props.emptyContent}
			fullWidthRowTemplate={({ dataItem }) => renderGroupRow(dataItem)}
			getRowAriaLabel={(item) => item.kind === 'operation'
				? `${item.operation.title}, ${formatMinorUnitsCurrency(
					item.operation.signedAmountMinor,
					item.operation.currency
				)}`
				: item.group.label}
			getRowClass={(item) => cn(
				item.kind === 'group' ? css.groupHeaderRow : css.operationRow,
				item.kind === 'operation'
					&& item.operation.id === props.highlightOperationId
					&& css.justCreatedRow
			)}
			getRowKey={(item) => item.key}
			isFullWidthRow={(item) => item.kind === 'group'}
			isRowSelected={(item) => (
				item.kind === 'operation' && item.operation.id === props.selectedOperationId
			)}
			scrollRef={setScrollElement}
			sort={{ columnId: props.sort.field, direction: props.sort.direction }}
			virtualization={{
				items: virtualizer.getVirtualItems(),
				measureElement: virtualizer.measureElement,
				scrollMargin: scrollMargin(),
				totalSize: virtualizer.getTotalSize()
			}}
			onRowClick={handleTableRowClick}
			onSortChange={handleSortFieldChange}
		/>
	);
}
