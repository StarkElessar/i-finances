import css from './compare-tab.module.scss';

import { formatMinorUnitsCurrency } from '@/shared/lib';
import { createRouteSearchParams } from '@/shared/routing/create-route-search-params';

import { getCategories } from '@/entities/category';
import { getContacts } from '@/entities/contact';
import { type BreakdownDimension, getMonthlyBreakdown, getMonthlyTrend } from '@/entities/operation';

import { type BreakdownReference, buildBreakdownMatrix, OTHER_SERIES_ID } from '@/views/statistics/lib/build-breakdown-matrix';
import { addMonths, countMonths } from '@/views/statistics/lib/month-keys';
import { type MonthRange, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';
import { resolveThemeColor } from '@/views/statistics/lib/resolve-theme-color';
import { decodeSelectionParam, encodeSelectionParam, sanitizeSelection } from '@/views/statistics/lib/selection';
import { readStoredComparison, writeStoredComparison } from '@/views/statistics/lib/selection-storage';
import { assignSeriesSlots, type SeriesSlotMap } from '@/views/statistics/lib/series-slots';
import { statisticsSearchParamsSchema } from '@/views/statistics/model/statistics-search-params';
import { BreakdownChart } from '@/views/statistics/ui/breakdown-chart/breakdown-chart';
import { BreakdownSummary } from '@/views/statistics/ui/breakdown-summary/breakdown-summary';
import { BreakdownTable } from '@/views/statistics/ui/breakdown-table/breakdown-table';
import { toMonthKey } from '@/views/statistics/ui/month-navigator/month-navigator';
import { PeriodRangePicker } from '@/views/statistics/ui/period-range-picker/period-range-picker';
import { ReferenceMultiselect, type ReferenceOption } from '@/views/statistics/ui/reference-multiselect/reference-multiselect';

import { MONTHLY_BREAKDOWN_MAX_MONTHS } from '@i-finances/contracts';
import { createAsync } from '@solidjs/router';
import { createEffect, createMemo, createSignal, For, type JSX, Show, untrack } from 'solid-js';

const DIMENSIONS: readonly { id: BreakdownDimension; label: string }[] = [
	{ id: 'category', label: 'Категории' },
	{ id: 'contact', label: 'Контакты' }
];

const PLAIN_AMOUNT_FORMATTER = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

const SERIES_FALLBACKS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

function browserStorage(): Storage | undefined {
	try {
		return typeof window === 'undefined' ? undefined : window.localStorage;
	}
	catch {
		return undefined;
	}
}

export function CompareTab(): JSX.Element {
	const currentMonth = toMonthKey(new Date());
	const search = createRouteSearchParams(statisticsSearchParamsSchema);
	const by = createMemo<BreakdownDimension>(() => search.params().by ?? 'category');
	const categories = createAsync(() => getCategories({ status: 'all' }));
	const contacts = createAsync(() => getContacts({ status: 'all' }));
	const trend = createAsync(() => getMonthlyTrend());
	const earliestMonth = createMemo(() => trend()?.points[0]?.month ?? addMonths(currentMonth, -23));
	const range = createMemo<MonthRange>(() => {
		const params = search.params();

		const isValid = params.from !== undefined && params.to !== undefined
			&& params.from <= params.to
			&& countMonths(params.from, params.to) <= MONTHLY_BREAKDOWN_MAX_MONTHS;

		return isValid && params.from !== undefined && params.to !== undefined
			? { from: params.from, to: params.to }
			: resolvePeriodPreset('ytd', currentMonth, earliestMonth());
	});
	const breakdown = createAsync(() => getMonthlyBreakdown({ by: by(), from: range().from, to: range().to }));
	// While a refetch for another dimension is in flight, the previous response
	// belongs to the other entity list and must not be combined with it.
	const currentBreakdown = createMemo(() => {
		const data = breakdown();

		return data?.by === by() ? data : undefined;
	});
	const references = createMemo<BreakdownReference[] | undefined>(() => {
		if (by() === 'category') {
			return categories()?.items.map((item) => ({
				budgetMinor: item.monthlyBudgetMinor,
				id: item.id,
				isArchived: item.archivedAt !== null,
				name: item.name
			}));
		}

		return contacts()?.items.map((item) => ({ budgetMinor: null, id: item.id, isArchived: item.archivedAt !== null, name: item.name }));
	});
	const baseCurrency = createMemo(() => breakdown()?.baseCurrency ?? categories()?.baseCurrency ?? 'BYN');
	const allIds = createMemo(() => references()?.map((reference) => reference.id) ?? []);
	// The selection is owned here, per dimension. URL and localStorage only seed
	// it once (when the entity list arrives) and then mirror it.
	const [selections, setSelections] = createSignal<Partial<Record<BreakdownDimension, string[]>>>({});
	const selectedIds = createMemo(() => selections()[by()] ?? []);
	const isSelectionReady = createMemo(() => selections()[by()] !== undefined);
	const [slotMaps, setSlotMaps] = createSignal<Partial<Record<BreakdownDimension, SeriesSlotMap>>>({});
	const matrix = createMemo(() => {
		const data = currentBreakdown();
		const refs = references();

		return data === undefined || refs === undefined || !isSelectionReady()
			? undefined
			: buildBreakdownMatrix({
				cells: data.cells,
				currentMonth,
				from: data.from,
				references: refs,
				selectedIds: selectedIds(),
				to: data.to
			});
	});
	const chartedSlots = createMemo(() => {
		const previous = slotMaps()[by()] ?? {};
		const current = matrix();

		if (current === undefined) {
			return previous;
		}

		return assignSeriesSlots(
			current.series.filter((series) => series.id !== OTHER_SERIES_ID).map((series) => series.id),
			previous
		);
	});
	const palette = createMemo(() => ({
		other: resolveThemeColor('--color-series-other', '#a3adbd'),
		series: SERIES_FALLBACKS.map((fallback, slot) => resolveThemeColor(`--color-series-${slot + 1}`, fallback))
	}));
	const options = createMemo<ReferenceOption[]>(() => {
		const data = currentBreakdown();
		const totals = new Map<string, number>();

		for (const cell of data?.cells ?? []) {
			totals.set(cell.referenceId, (totals.get(cell.referenceId) ?? 0) + cell.totalMinor);
		}

		return (references() ?? [])
			.map((reference) => ({
				id: reference.id,
				isArchived: reference.isArchived,
				name: reference.name,
				periodTotalMinor: totals.get(reference.id) ?? 0
			}))
			.toSorted((left, right) => right.periodTotalMinor - left.periodTotalMinor || left.name.localeCompare(right.name, 'ru'));
	});
	const colorOf = (id: string) => {
		const slots = chartedSlots();

		return Object.hasOwn(slots, id) ? palette().series[slots[id]] : palette().other;
	};
	const formatAmount = (minor: number) => formatMinorUnitsCurrency(minor, baseCurrency(), { maximumFractionDigits: 0 });
	const formatExact = (minor: number) => formatMinorUnitsCurrency(minor, baseCurrency());
	const formatPlain = (minor: number) => PLAIN_AMOUNT_FORMATTER.format(minor / 100);

	const handleSelection = (ids: string[]) => {
		setSelections((previous) => ({ ...previous, [by()]: ids }));
		search.setParams({ ids: encodeSelectionParam(ids, allIds()) }, { history: 'replace' });
	};
	const handleDimension = (next: BreakdownDimension) => {
		search.setParams({ by: next, ids: undefined }, { history: 'replace' });
	};
	const handleRange = (next: MonthRange) => {
		search.setParams({ from: next.from, to: next.to }, { history: 'replace' });
	};

	createEffect(() => {
		const dimension = by();
		const ids = allIds();

		if (references() === undefined || untrack(selections)[dimension] !== undefined) {
			return;
		}

		const storage = browserStorage();
		const stored = storage === undefined ? undefined : readStoredComparison(storage, dimension);
		const fromUrl = decodeSelectionParam(untrack(() => search.params().ids), ids);

		setSelections((previous) => ({ ...previous, [dimension]: fromUrl ?? sanitizeSelection(stored?.ids ?? [], ids) }));
		setSlotMaps((previous) => ({ ...previous, [dimension]: stored?.slots ?? {} }));
	});
	createEffect(() => {
		const dimension = by();
		const next = chartedSlots();

		if (matrix() === undefined || JSON.stringify(next) === JSON.stringify(untrack(slotMaps)[dimension])) {
			return;
		}

		setSlotMaps((previous) => ({ ...previous, [dimension]: next }));
	});
	createEffect(() => {
		const storage = browserStorage();

		if (storage !== undefined && isSelectionReady()) {
			writeStoredComparison(storage, by(), { ids: selectedIds(), slots: chartedSlots() });
		}
	});

	return (
		<div class={css.root}>
			<div class={css.controls}>
				<div class={css.segment} role='group' aria-label='Разрез'>
					<For each={DIMENSIONS}>
						{(item) => (
							<button
								aria-pressed={by() === item.id}
								class={css.segmentButton}
								onClick={() => handleDimension(item.id)}
								type='button'
							>
								{item.label}
							</button>
						)}
					</For>
				</div>
				<ReferenceMultiselect
					colorOf={colorOf}
					formatAmount={formatAmount}
					noun={by()}
					onChange={handleSelection}
					options={options()}
					selectedIds={selectedIds()}
				/>
				<PeriodRangePicker currentMonth={currentMonth} earliestMonth={earliestMonth()} onChange={handleRange} range={range()}/>
			</div>
			<Show when={matrix()} fallback={<p>Загрузка…</p>}>
				{(current) => (
					<Show
						when={selectedIds().length > 0}
						fallback={(
							<div class={css.empty}>
								<b>{by() === 'category' ? 'Выберите категории' : 'Выберите контакты'}</b>
								<span>
									Можно выбрать несколько или сразу «Все».
									По месяцам появятся столбцы, итоги и среднее.
								</span>
							</div>
						)}
					>
						<Show
							when={current().rows.length > 0}
							fallback={(
								<div class={css.empty}>
									<b>За этот период трат нет</b>
									<span>Расширьте период или выберите другие строки.</span>
								</div>
							)}
						>
							<BreakdownSummary currentMonth={currentMonth} formatAmount={formatAmount} matrix={current()}/>
							<BreakdownChart
								colorOf={colorOf}
								currentMonth={currentMonth}
								formatExact={formatExact}
								matrix={current()}
								surfaceColor={resolveThemeColor('--color-surface', '#ffffff')}
							/>
							<BreakdownTable
								colorOf={colorOf}
								currency={baseCurrency()}
								currentMonth={currentMonth}
								formatAmount={formatPlain}
								matrix={current()}
								noun={by()}
							/>
						</Show>
					</Show>
				)}
			</Show>
		</div>
	);
}
