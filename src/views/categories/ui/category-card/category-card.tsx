import css from './category-card.module.scss';

import { cn, type CurrencyCodeValue } from '~/shared/lib';

import type { Category, CategoryBudgetSummary } from '~/entities/category';
import { formatMinorUnitsCurrency } from '~/entities/category';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type CategoryCardProps = {
	category: Category;
	currency: CurrencyCodeValue;
	summary: CategoryBudgetSummary;
	class?: string;
	isDragging?: boolean;
	onClick?: () => void;
	onPointerCancel?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
	onPointerDown?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
	onPointerMove?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
	onPointerUp?: JSX.EventHandler<HTMLButtonElement, PointerEvent>;
};

function getCategoryCardStyle(category: Category, summary: CategoryBudgetSummary): JSX.CSSProperties {
	return {
		'--category-color': category.color,
		'--category-progress': `${summary.progressPercent}%`
	};
}

function getBudgetLabel(summary: CategoryBudgetSummary, currency: CurrencyCodeValue): string {
	if (!summary.hasBudget || summary.monthlyBudgetMinor === null) {
		return 'Без бюджета';
	}

	return `Бюджет ${formatMinorUnitsCurrency(summary.monthlyBudgetMinor, currency)}`;
}

function getPercentLabel(summary: CategoryBudgetSummary): string {
	if (summary.usagePercent === null) {
		return 'Без лимита';
	}

	return `${summary.usagePercent}%`;
}

export function CategoryCard(props: CategoryCardProps) {
	return (
		<button
			class={cn(
				css.root,
				props.summary.isOverBudget && css.overBudget,
				props.isDragging && css.dragging,
				props.class
			)}
			style={getCategoryCardStyle(props.category, props.summary)}
			type='button'
			onClick={props.onClick}
			onPointerCancel={props.onPointerCancel}
			onPointerDown={props.onPointerDown}
			onPointerMove={props.onPointerMove}
			onPointerUp={props.onPointerUp}
		>
			<span class={css.icon} aria-hidden='true'>
				<span/>
			</span>

			<span class={css.content}>
				<span class={css.titleRow}>
					<span class={css.title}>{props.category.name}</span>
					<Show when={props.summary.hasBudget}>
						<span class={css.percent}>{getPercentLabel(props.summary)}</span>
					</Show>
				</span>
				<span class={css.spent}>
					Потрачено <strong>{formatMinorUnitsCurrency(props.summary.spentMinor, props.currency)}</strong>
				</span>
			</span>

			<Show when={props.summary.hasBudget}>
				<span class={css.progressTrack} aria-hidden='true'>
					<span class={css.progressBar}/>
				</span>
			</Show>

			<span class={css.footer}>
				<span>{getBudgetLabel(props.summary, props.currency)}</span>
				<Show when={props.summary.isOverBudget}>
					<span class={css.limitState}>Превышен лимит</span>
				</Show>
			</span>
		</button>
	);
}
