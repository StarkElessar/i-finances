import css from './operations-list.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';

import { CategoryIcon } from '@/entities/category';
import type { OperationWithBalance } from '@/entities/operation';

type OperationListRowProps = {
	highlighted: boolean;
	operation: OperationWithBalance;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	selected: boolean;
	onSelect: (operation: OperationWithBalance) => void;
};

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

export function OperationListRow(props: OperationListRowProps) {
	return (
		<button
			aria-current={props.selected}
			class={cn(css.item, props.selected && css.itemSelected, props.highlighted && css.itemHighlighted)}
			style={{ '--category-color': props.resolveCategoryColor(props.operation) }}
			type='button'
			onClick={() => props.onSelect(props.operation)}
		>
			<span aria-hidden='true' class={css.categoryIcon}>
				<CategoryIcon icon={props.resolveCategoryIcon(props.operation)} size={16}/>
			</span>
			<span class={css.itemMain}>
				<span class={css.itemTitle}>{props.operation.title}</span>
				<span class={css.itemAmount}>
					{formatMinorUnitsCurrency(props.operation.signedAmountMinor, props.operation.currency)}
				</span>
			</span>
			<span class={css.itemMeta}>
				<span>{formatShortDate(props.operation.happenedOn)}</span>
				<span>{formatMinorUnitsCurrency(props.operation.balanceAfterMinor, props.operation.currency)}</span>
			</span>
		</button>
	);
}
