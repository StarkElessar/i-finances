import css from './operations-workspace.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { Fab } from '@/shared/ui/fab';
import { PeriodNavigator } from '@/shared/ui/period-navigator';
import type { SegmentedOption } from '@/shared/ui/segmented';
import { Segmented } from '@/shared/ui/segmented';
import { TextField } from '@/shared/ui/text-field';

import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { OperationPeriodMode, OperationSortField, OperationWithBalance } from '@/entities/operation';
import { getOperationPeriodRange, parseLocalDateKey, useOperationsDisplayMode } from '@/entities/operation';

import {
	ArrowDownWideNarrow,
	ArrowLeftRight,
	ArrowUpNarrowWide,
	ListFilter,
	Plus,
	Search,
	X
} from 'lucide-solid';
import { createSignal, Show } from 'solid-js';

import { OperationsList } from '../operations-list/operations-list';
import { OperationsTable } from '../operations-table/operations-table';

import { useOperationsView } from './lib/use-operations-view';

const PERIOD_OPTIONS: SegmentedOption<OperationPeriodMode>[] = [
	{ value: 'week', label: 'Неделя' },
	{ value: 'month', label: 'Месяц' },
	{ value: 'year', label: 'Год' }
];

export type OperationsWorkspaceProps = {
	account: Account;
	categories: readonly Category[];
	highlightOperationId?: string;
	periodFrom: string;
	periodMode: OperationPeriodMode;
	selectedOperationId?: string;
	onCreateOperation: () => void;
	onCreateTransfer: () => void;
	onOperationSelect: (operation: OperationWithBalance) => void;
	onPeriodModeChange: (mode: OperationPeriodMode) => void;
	onPeriodMove: (offset: number) => void;
};

function formatPeriodLabel(anchorDate: Date, mode: OperationPeriodMode): string {
	if (mode === 'year') {
		return String(anchorDate.getFullYear());
	}

	if (mode === 'month') {
		const value = new Intl.DateTimeFormat('ru-BY', { month: 'long', year: 'numeric' }).format(anchorDate);

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

export function OperationsWorkspace(props: OperationsWorkspaceProps) {
	let searchInput: HTMLInputElement | undefined;
	const view = useOperationsView(props);
	const { resolvedMode } = useOperationsDisplayMode();
	const [isSearchOpen, setIsSearchOpen] = createSignal(false);

	const handleSortDirectionChange = () => {
		view.setSort({
			...view.sort(),
			direction: view.sort().direction === 'desc' ? 'asc' : 'desc'
		});
	};

	const handleOpenSearch = () => {
		setIsSearchOpen(true);
		queueMicrotask(() => searchInput?.focus());
	};

	const handleCloseSearch = () => {
		view.setSearchQuery('');
		setIsSearchOpen(false);
	};

	const handleSearchKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			handleCloseSearch();
		}
	};

	const bodyProps = () => ({
		account: props.account,
		emptyContent: view.isLoading()
			? 'Загрузка операций…'
			: view.searchQuery()
				? 'По вашему запросу ничего не найдено'
				: 'В этом периоде операций нет',
		groups: view.groups(),
		highlightOperationId: props.highlightOperationId,
		resolveCategoryColor: view.resolveCategoryColor,
		resolveCategoryIcon: view.resolveCategoryIcon,
		selectedOperationId: props.selectedOperationId,
		sort: view.sort(),
		onOperationSelect: props.onOperationSelect,
		onSortFieldChange: (columnId: string) => {
			if (view.sort().field === columnId) {
				return;
			}

			view.setSort({ direction: columnId === 'date' ? 'desc' : 'asc', field: columnId as OperationSortField });
		}
	});

	return (
		<section aria-busy={view.isLoading()} aria-label='Операции счёта' class={css.root}>
			<div class={css.toolbar}>
				<div class={css.toolbarGroup}>
					<Button
						aria-label={view.sort().direction === 'desc' ? 'Показать в обратном порядке' : 'Показать в прямом порядке'}
						iconOnly
						size='sm'
						title={view.sort().direction === 'desc' ? 'По убыванию' : 'По возрастанию'}
						variant='secondary'
						onClick={handleSortDirectionChange}
					>
						<Show fallback={<ArrowUpNarrowWide size={17}/>} when={view.sort().direction === 'desc'}>
							<ArrowDownWideNarrow size={17}/>
						</Show>
					</Button>
					<span class={css.sortField}>
						<select
							aria-label='Сортировать по'
							class={css.sortSelect}
							value={view.sort().field}
							onChange={(event) => {
								const field = event.currentTarget.value as OperationSortField;

								view.setSort({
									direction: field === 'date' ? 'desc' : 'asc',
									field
								});
							}}
						>
							<option value='date'>По дате</option>
							<option value='amount'>По сумме</option>
							<option value='balance'>По балансу</option>
							<option value='category'>По категории</option>
							<option value='contact'>По контакту</option>
						</select>
						<ListFilter aria-hidden='true' class={css.sortIcon} size={16}/>
					</span>
					<Segmented
						aria-label='Период'
						class={css.periodSwitch}
						options={PERIOD_OPTIONS}
						value={props.periodMode}
						onChange={props.onPeriodModeChange}
					/>
				</div>

				<PeriodNavigator
					canMoveNext={view.canMoveToNextPeriod()}
					class={css.periodNavigation}
					label={formatPeriodLabel(view.periodAnchor(), props.periodMode)}
					nextLabel='Следующий период'
					previousLabel='Предыдущий период'
					onNext={() => props.onPeriodMove(1)}
					onPrevious={() => props.onPeriodMove(-1)}
				/>

				<div class={cn(css.toolbarGroup, css.toolbarActions)}>
					<Show when={!isSearchOpen()}>
						<Button aria-label='Открыть поиск' iconOnly size='sm' variant='ghost' onClick={handleOpenSearch}>
							<Search size={18}/>
						</Button>
					</Show>
					<Button aria-label='Добавить перевод' iconOnly size='sm' variant='secondary' onClick={props.onCreateTransfer}>
						<ArrowLeftRight size={18}/>
					</Button>
					<Button
						aria-label='Добавить операцию'
						class={css.addOperation}
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
						value={view.searchQuery()}
						onInput={(event) => view.setSearchQuery(event.currentTarget.value)}
						onKeyDown={handleSearchKeyDown}
					/>
					<Button aria-label='Закрыть поиск' iconOnly size='sm' variant='ghost' onClick={handleCloseSearch}>
						<X size={17}/>
					</Button>
				</div>
			</Show>

			<Show fallback={<OperationsList {...bodyProps()}/>} when={resolvedMode() === 'table'}>
				<OperationsTable {...bodyProps()}/>
			</Show>

			<Fab aria-label='Новая операция' onClick={props.onCreateOperation}>
				<Plus size={26}/>
			</Fab>
		</section>
	);
}
