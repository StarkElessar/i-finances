import css from './operations-workspace.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { OperationPeriodMode, OperationSortField, OperationWithBalance } from '@/entities/operation';
import { getOperationPeriodRange, parseLocalDateKey } from '@/entities/operation';

import { useOperationsView } from './lib/use-operations-view';
import { OperationsTable } from '../operations-table/operations-table';

import {
	ArrowLeftRight,
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	ChevronLeft,
	ChevronRight,
	Plus,
	Search,
	X
} from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';

const PERIOD_LABELS: Record<OperationPeriodMode, string> = {
	month: 'Месяц',
	week: 'Неделя',
	year: 'Год'
};
const PERIOD_MODES: OperationPeriodMode[] = ['week', 'month', 'year'];

export type OperationsWorkspaceProps = {
	account: Account;
	categories: readonly Category[];
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
					<div aria-label='Период' class={css.periodSwitch} role='group'>
						<For each={PERIOD_MODES}>
							{(mode) => (
								<button
									aria-pressed={props.periodMode === mode}
									class={cn(css.periodButton, props.periodMode === mode && css.periodButtonActive)}
									disabled={props.periodMode === mode}
									type='button'
									onClick={() => props.periodMode !== mode && props.onPeriodModeChange(mode)}
								>
									{PERIOD_LABELS[mode]}
								</button>
							)}
						</For>
					</div>
				</div>

				<div class={css.periodNavigation}>
					<Button aria-label='Предыдущий период' iconOnly size='sm' variant='ghost' onClick={() => props.onPeriodMove(-1)}>
						<ChevronLeft size={18}/>
					</Button>
					<span class={css.periodLabel}>{formatPeriodLabel(view.periodAnchor(), props.periodMode)}</span>
					<Button
						aria-label='Следующий период'
						disabled={!view.canMoveToNextPeriod()}
						iconOnly
						size='sm'
						variant='ghost'
						onClick={() => props.onPeriodMove(1)}
					>
						<ChevronRight size={18}/>
					</Button>
				</div>

				<div class={cn(css.toolbarGroup, css.toolbarActions)}>
					<Show when={!isSearchOpen()}>
						<Button aria-label='Открыть поиск' iconOnly size='sm' variant='ghost' onClick={handleOpenSearch}>
							<Search size={18}/>
						</Button>
					</Show>
					<Button aria-label='Добавить перевод' iconOnly size='sm' variant='secondary' onClick={props.onCreateTransfer}>
						<ArrowLeftRight size={18}/>
					</Button>
					<Button aria-label='Добавить операцию' iconOnly size='sm' variant='primary' onClick={props.onCreateOperation}>
						<Plus size={18}/>
					</Button>
				</div>
			</div>

			<Show when={isSearchOpen()}>
				<div class={css.searchRow}>
					<TextField
						ref={(element) => { searchInput = element; }}
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

			<OperationsTable
				account={props.account}
				emptyContent={view.isLoading()
					? 'Загрузка операций…'
					: view.searchQuery()
						? 'По вашему запросу ничего не найдено'
						: 'В этом периоде операций нет'}
				groups={view.groups()}
				resolveCategoryColor={view.resolveCategoryColor}
				resolveCategoryIcon={view.resolveCategoryIcon}
				selectedOperationId={props.selectedOperationId}
				sort={view.sort()}
				onOperationSelect={props.onOperationSelect}
				onSortFieldChange={(columnId) => {
					if (view.sort().field === columnId) {
						return;
					}

					view.setSort({ direction: columnId === 'date' ? 'desc' : 'asc', field: columnId as OperationSortField });
				}}
			/>
		</section>
	);
}
