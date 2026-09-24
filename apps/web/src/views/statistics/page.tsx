import css from './statistics.module.scss';

import { createRouteSearchParams } from '@/shared/routing/create-route-search-params';
import { Container } from '@/shared/ui';

import { getCategories } from '@/entities/category';
import { getCategoryStats, getMonthlyTrend, startOfPeriod } from '@/entities/operation';

import { Title } from '@solidjs/meta';
import { createAsync } from '@solidjs/router';
import { ChartColumnBig } from 'lucide-solid';
import { createMemo, createSignal, ErrorBoundary, Match, Show, Switch } from 'solid-js';

import { buildCategoryChartData } from './lib/build-category-chart-data';
import { buildTrendChartData } from './lib/build-trend-chart-data';
import { resolveThemeColor } from './lib/resolve-theme-color';
import { statisticsSearchParamsSchema } from './model/statistics-search-params';
import { CategoryBreakdownChart } from './ui/category-breakdown-chart/category-breakdown-chart';
import { CompareTab } from './ui/compare-tab/compare-tab';
import { MonthNavigator, toMonthKey } from './ui/month-navigator/month-navigator';
import { MonthlyTrendChart } from './ui/monthly-trend-chart/monthly-trend-chart';

type StatisticsTab = 'compare' | 'overview';

const TABS: readonly { id: StatisticsTab; label: string }[] = [
	{ id: 'overview', label: 'Обзор' },
	{ id: 'compare', label: 'Сравнение' }
];

function OverviewTab() {
	const now = new Date();
	const [monthAnchor, setMonthAnchor] = createSignal(startOfPeriod(now, 'month'));
	const monthKey = createMemo(() => toMonthKey(monthAnchor()));

	const categories = createAsync(() => getCategories({ status: 'all' }));
	const categoryStats = createAsync(() => getCategoryStats({ month: monthKey() }));
	const monthlyTrend = createAsync(() => getMonthlyTrend());

	const categoryChart = createMemo(() => {
		const stats = categoryStats();
		const categoryList = categories();

		return stats === undefined || categoryList === undefined
			? undefined
			: buildCategoryChartData(stats, categoryList.items);
	});

	const trendChart = createMemo(() => {
		const trend = monthlyTrend();

		return trend === undefined
			? undefined
			: buildTrendChartData(trend, {
				expense: resolveThemeColor('--color-danger', '#c82d4d'),
				income: resolveThemeColor('--color-success', '#147a50')
			});
	});

	return (
		<>
			<section class={css.section}>
				<div class={css.sectionHeader}>
					<h2>Траты по категориям</h2>
					<MonthNavigator anchor={monthAnchor()} now={now} onChange={setMonthAnchor}/>
				</div>
				<Show when={categoryChart()} fallback={<p>Загрузка…</p>}>
					{(result) => <CategoryBreakdownChart result={result()}/>}
				</Show>
			</section>

			<section class={css.section}>
				<div class={css.sectionHeader}>
					<h2>Динамика по месяцам</h2>
				</div>
				<Show when={trendChart()} fallback={<p>Загрузка…</p>}>
					{(data) => <MonthlyTrendChart data={data()}/>}
				</Show>
			</section>
		</>
	);
}

function StatisticsContent() {
	const search = createRouteSearchParams(statisticsSearchParamsSchema);
	const tab = createMemo<StatisticsTab>(() => search.params().tab ?? 'overview');

	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.titleRow}>
					<div class={css.titleMain}>
						<ChartColumnBig aria-hidden='true' size={28}/>
						<h1>Статистика</h1>
					</div>
					<div class={css.tabs} role='tablist'>
						{TABS.map((item) => (
							<button
								aria-selected={tab() === item.id}
								class={css.tab}
								onClick={() => search.setParams({ tab: item.id })}
								role='tab'
								type='button'
							>
								{item.label}
							</button>
						))}
					</div>
				</div>

				<Switch>
					<Match when={tab() === 'overview'}>
						<OverviewTab/>
					</Match>
					<Match when={tab() === 'compare'}>
						<section class={css.section}>
							<CompareTab/>
						</section>
					</Match>
				</Switch>
			</Container>
		</main>
	);
}

function StatisticsLoadError() {
	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.section}>
					<h1>Не удалось загрузить статистику</h1>
					<p>Обновите страницу и повторите попытку.</p>
				</div>
			</Container>
		</main>
	);
}

/**
 * Renders the statistics overview (category spend, monthly trend) and the
 * month-by-month comparison of selected categories or contacts.
 */
export function StatisticsPage() {
	return (
		<>
			<Title>Статистика — iFinances</Title>
			<ErrorBoundary fallback={<StatisticsLoadError/>}>
				<StatisticsContent/>
			</ErrorBoundary>
		</>
	);
}
