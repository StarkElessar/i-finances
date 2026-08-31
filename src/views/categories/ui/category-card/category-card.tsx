import css from './category-card.module.scss';

import { cn, type CurrencyCodeValue } from '~/shared/lib';
import { Button } from '~/shared/ui';

import type { Category, CategoryBudgetSummary } from '~/entities/category';
import { CategoryIcon, formatMinorUnitsCurrency } from '~/entities/category';

import { Pencil } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

/**
 * Props for a category budget card with optional click and edit actions.
 */
export type CategoryCardProps = {
	category: Category;
	currency: CurrencyCodeValue;
	summary: CategoryBudgetSummary;
	class?: string;
	isDragging?: boolean;
	onClick?: () => void;
	onEdit?: () => void;
	onPointerCancel?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerDown?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerMove?: JSX.EventHandler<HTMLElement, PointerEvent>;
	onPointerUp?: JSX.EventHandler<HTMLElement, PointerEvent>;
};

/**
 * Builds CSS custom properties for the category accent and budget progress.
 */
function getCategoryCardStyle(category: Category, summary: CategoryBudgetSummary): JSX.CSSProperties {
	return {
		'--category-color': category.color,
		'--category-progress': `${summary.progressPercent}%`
	};
}

/**
 * Formats the footer budget label for the given summary and currency.
 */
function getBudgetLabel(summary: CategoryBudgetSummary, currency: CurrencyCodeValue): string {
	if (!summary.hasBudget || summary.monthlyBudgetMinor === null) {
		return 'Без бюджета';
	}

	return `Бюджет ${formatMinorUnitsCurrency(summary.monthlyBudgetMinor, currency)}`;
}

/**
 * Formats the usage percent label shown next to the category title.
 */
function getPercentLabel(summary: CategoryBudgetSummary): string {
	if (summary.usagePercent === null) {
		return 'Без лимита';
	}

	return `${summary.usagePercent}%`;
}

/**
 * Category budget card with spent amount, optional progress, and edit control.
 */
export function CategoryCard(props: CategoryCardProps) {
	const handleEditClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
		event.stopPropagation();
		props.onEdit?.();
	};

	const handleEditPointerDown: JSX.EventHandler<HTMLButtonElement, PointerEvent> = (event) => {
		event.stopPropagation();
	};

	return (
		<article
			class={cn(
				css.root,
				props.onClick && css.clickable,
				props.summary.isOverBudget && css.overBudget,
				props.isDragging && css.dragging,
				props.class
			)}
			style={getCategoryCardStyle(props.category, props.summary)}
		>
			{/* Drag capture + click must share one node, or click never fires. */}
			<Show
				fallback={(
					<div
						class={css.body}
						onPointerCancel={props.onPointerCancel}
						onPointerDown={props.onPointerDown}
						onPointerMove={props.onPointerMove}
						onPointerUp={props.onPointerUp}
					>
						<CategoryCardBody
							category={props.category}
							currency={props.currency}
							summary={props.summary}
						/>
					</div>
				)}
				when={props.onClick}
			>
				<button
					class={css.body}
					type='button'
					onClick={() => props.onClick?.()}
					onPointerCancel={props.onPointerCancel}
					onPointerDown={props.onPointerDown}
					onPointerMove={props.onPointerMove}
					onPointerUp={props.onPointerUp}
				>
					<CategoryCardBody
						category={props.category}
						currency={props.currency}
						summary={props.summary}
					/>
				</button>
			</Show>

			<Show when={props.onEdit}>
				<Button
					aria-label={`Редактировать категорию ${props.category.name}`}
					class={css.editButton}
					iconOnly
					size='sm'
					title='Редактировать категорию'
					type='button'
					variant='ghost'
					onClick={handleEditClick}
					onPointerDown={handleEditPointerDown}
				>
					<Pencil size={15}/>
				</Button>
			</Show>
		</article>
	);
}

type CategoryCardBodyProps = {
	category: Category;
	currency: CurrencyCodeValue;
	summary: CategoryBudgetSummary;
};

/**
 * Renders the shared visual content of a category card.
 */
function CategoryCardBody(props: CategoryCardBodyProps) {
	return (
		<>
			<span class={css.icon} aria-hidden='true'>
				<CategoryIcon icon={props.category.icon} size={18}/>
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
		</>
	);
}
