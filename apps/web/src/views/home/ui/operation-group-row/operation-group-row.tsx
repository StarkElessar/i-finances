import css from './operation-group-row.module.scss';

import { cn, formatDate, formatMinorUnitsCurrency } from '@/shared/lib';

import { CategoryIcon } from '@/entities/category';
import type { OperationGroup, OperationWithBalance } from '@/entities/operation';
import { parseLocalDateKey } from '@/entities/operation';

import {
	ArrowDownRight,
	ArrowUpRight,
	Building2,
	CalendarDays,
	CircleDollarSign,
	Minus,
	WalletCards
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type OperationGroupRowProps = {
	group: OperationGroup;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
};

function formatGroupLabel(group: OperationGroup): string {
	return group.type === 'date' ? formatDate(parseLocalDateKey(group.label)) : group.label;
}

function GroupIcon(props: { categoryIcon: string; group: OperationGroup }) {
	if (props.group.type === 'date') {
		return <CalendarDays aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'category') {
		return (
			<span aria-hidden='true' class={css.groupCategoryIcon}>
				<CategoryIcon icon={props.categoryIcon} size={14}/>
			</span>
		);
	}

	if (props.group.type === 'contact') {
		return <Building2 aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'amount') {
		return <CircleDollarSign aria-hidden='true' size={15}/>;
	}

	return <WalletCards aria-hidden='true' size={15}/>;
}

function BalanceDirection(props: { differenceMinor: number }) {
	if (props.differenceMinor > 0) {
		return <ArrowUpRight aria-label='Баланс увеличился' class={css.balanceUp} size={17}/>;
	}

	if (props.differenceMinor < 0) {
		return <ArrowDownRight aria-label='Баланс уменьшился' class={css.balanceDown} size={17}/>;
	}

	return <Minus aria-label='Баланс не изменился' class={css.balanceNeutral} size={17}/>;
}

export function OperationGroupRow(props: OperationGroupRowProps) {
	const currency = () => props.group.operations[0]?.currency;
	const categoryColor = () => props.resolveCategoryColor(props.group.operations[0]);
	const categoryIcon = () => props.resolveCategoryIcon(props.group.operations[0]);
	const groupStyle = (): JSX.CSSProperties => ({ '--group-color': categoryColor() });

	return (
		<div class={css.groupRow} style={groupStyle()}>
			<span class={css.groupHeading}>
				<GroupIcon categoryIcon={categoryIcon()} group={props.group}/>
				<span>{formatGroupLabel(props.group)}</span>
			</span>
			<Show when={props.group.type === 'date' && currency()}>
				{(resolvedCurrency) => (
					<span class={css.groupBalance}>
						<span>{formatMinorUnitsCurrency(
							props.group.openingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<BalanceDirection differenceMinor={props.group.differenceMinor ?? 0}/>
						<span>{formatMinorUnitsCurrency(
							props.group.closingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<span
							class={cn(
								css.groupDifference,
								(props.group.differenceMinor ?? 0) > 0 && css.groupDifferencePositive,
								(props.group.differenceMinor ?? 0) < 0 && css.groupDifferenceNegative
							)}
						>
							({formatMinorUnitsCurrency(
								props.group.differenceMinor ?? 0,
								resolvedCurrency(),
								{ signDisplay: 'always' }
							)})
						</span>
					</span>
				)}
			</Show>
			<span class={css.groupCount}>{props.group.operations.length}</span>
		</div>
	);
}
