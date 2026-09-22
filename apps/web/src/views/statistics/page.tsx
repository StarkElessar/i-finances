import css from './statistics.module.scss';

import { Container } from '@/shared/ui';

import { getCategories } from '@/entities/category';
import { getCategoryStats, getMonthlyTrend, startOfPeriod } from '@/entities/operation';

import { Title } from '@solidjs/meta';
import { createAsync } from '@solidjs/router';
import { ChartColumnBig } from 'lucide-solid';
import { createMemo, createSignal, ErrorBoundary, Show } from 'solid-js';

import { buildCategoryChartData } from './lib/build-category-chart-data';
import { buildTrendChartData } from './lib/build-trend-chart-data';
import { CategoryBreakdownChart } from './ui/category-breakdown-chart/category-breakdown-chart';
import { MonthNavigator, toMonthKey } from './ui/month-navigator/month-navigator';
import { MonthlyTrendChart } from './ui/monthly-trend-chart/monthly-trend-chart';

function resolveThemeColor(variableName: string, fallback: string): string {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

	return value || fallback;
}

function StatisticsContent() {
	const now = new Date();
	const [monthAnchor, setMonthAnchor] = createSignal(startOfPeriod(now, 'month'));
	const monthKey = createMemo(() => toMonthKey(monthAnchor()));

	const categories = createAsync(() => getCategories({ status: 'active' }));
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
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.titleRow}>
					<ChartColumnBig aria-hidden='true' size={28}/>
					<h1>Статистика</h1>
				</div>

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
 * Renders category spend (vs. budget or history) and the monthly trend.
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
