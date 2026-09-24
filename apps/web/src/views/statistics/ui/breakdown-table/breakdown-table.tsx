import css from './breakdown-table.module.scss';

import { cn } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';

import { createMemo, For, type JSX, Show } from 'solid-js';

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatShortMonth(monthKey: string, isFirst: boolean): string {
	const month = Number(monthKey.slice(5));
	const label = SHORT_MONTHS[month - 1];

	return isFirst || month === 1 ? `${label} ’${monthKey.slice(2, 4)}` : label;
}

export type BreakdownTableProps = {
	colorOf: (id: string) => string;
	currency: string;
	currentMonth: string;
	formatAmount: (minor: number) => string;
	matrix: BreakdownMatrix;
	noun: 'category' | 'contact';
};

export function BreakdownTable(props: BreakdownTableProps): JSX.Element {
	const hasBudget = createMemo(() => props.matrix.rows.some((row) => row.budgetMinor !== null));
	const budgetTotal = createMemo(() => props.matrix.rows.reduce((total, row) => total + (row.budgetMinor ?? 0), 0));
	const cell = (value: number) => (value === 0 ? '—' : props.formatAmount(value));
	const isCurrent = (index: number) => props.matrix.months[index] === props.currentMonth;

	return (
		<div class={css.root}>
			<div class={css.scroll}>
				<table class={css.table}>
					<thead>
						<tr>
							<th class={css.name}>{props.noun === 'category' ? 'Категория' : 'Контакт'}</th>
							<For each={props.matrix.months}>
								{(month, index) => (
									<th class={cn(isCurrent(index()) && css.partial)}>
										{formatShortMonth(month, index() === 0)}
										<Show when={isCurrent(index())}><small class={css.partialNote}>неполный</small></Show>
									</th>
								)}
							</For>
							<th class={css.sum}>Итого</th>
							<th>Ср./мес</th>
							<Show when={hasBudget()}><th>Бюджет</th></Show>
						</tr>
					</thead>
					<tbody>
						<For each={props.matrix.rows}>
							{(row) => (
								<tr>
									<td class={css.name}>
										<span class={css.nameInner}>
											<span class={css.dot} style={{ 'background-color': props.colorOf(row.id) }}/>
											<span class={css.nameText} title={row.name}>{row.name}</span>
										</span>
									</td>
									<For each={row.values}>
										{(value, index) => {
											const budget = row.budgetMinor;
											const isOver = budget !== null && value > budget;
											const overTitle = isOver
												? `Бюджет ${props.formatAmount(budget)} превышен на ${props.formatAmount(value - budget)}`
												: undefined;

											return (
												<td
													class={cn(
														value === 0 && css.zero,
														isOver && css.over,
														isCurrent(index()) && css.partial
													)}
													title={overTitle}
												>
													{cell(value)}
												</td>
											);
										}}
									</For>
									<td class={css.sum}>{props.formatAmount(row.totalMinor)}</td>
									<td>{row.avgMinor === null ? '—' : props.formatAmount(row.avgMinor)}</td>
									<Show when={hasBudget()}>
										<td class={css.budget}>{row.budgetMinor === null ? '—' : props.formatAmount(row.budgetMinor)}</td>
									</Show>
								</tr>
							)}
						</For>
					</tbody>
					<tfoot>
						<tr>
							<td class={css.name}>Итого</td>
							<For each={props.matrix.colTotals}>
								{(value, index) => <td class={cn(isCurrent(index()) && css.partial)}>{props.formatAmount(value)}</td>}
							</For>
							<td class={css.sum}>{props.formatAmount(props.matrix.totalMinor)}</td>
							<td>{props.matrix.avgMinor === null ? '—' : props.formatAmount(props.matrix.avgMinor)}</td>
							<Show when={hasBudget()}><td class={css.budget}>{props.formatAmount(budgetTotal())}</td></Show>
						</tr>
					</tfoot>
				</table>
			</div>
			<div class={css.notes}>
				<span>
					Суммы в {props.currency}, округлены до рубля. «Ср./мес» — среднее по закрытым месяцам периода,
					текущий неполный месяц не учитывается.
				</span>
				<Show when={props.matrix.hiddenZeroCount > 0}>
					<span>Скрыто без трат за период: {props.matrix.hiddenZeroCount}.</span>
				</Show>
				<Show when={props.matrix.folded.length > 0}>
					<span>
						На графике 7 крупнейших отдельно, остальные {props.matrix.folded.length} собраны в «Остальные».
						В таблице есть все.
					</span>
				</Show>
				<Show when={hasBudget()}>
					<span><span class={css.overSwatch}/>месяц, в котором бюджет категории превышен</span>
				</Show>
			</div>
		</div>
	);
}
