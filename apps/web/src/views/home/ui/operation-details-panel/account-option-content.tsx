import css from './operation-details-panel.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import { AccountIcon } from '@/shared/ui/account-icon';
import { Badge } from '@/shared/ui/badge';

import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import type { OperationAccountChoice } from './types';

type AccountOptionContentProps = {
	/** The trigger shows the name only; the list adds the balance and the «Текущий счёт» line. */
	compact?: boolean;
	/** The account the operation lies on now. */
	current: boolean;
	option: OperationAccountChoice;
};

/**
 * One account in the «Счёт» picker: type icon, name, balance (boards `M-OpMoveAccount`, `D-OpMoveAccount`).
 */
export function AccountOptionContent(props: AccountOptionContentProps) {
	const style = (): JSX.CSSProperties => ({ '--account-color': props.option.color });

	return (
		<span class={css.optionLayout}>
			<AccountIcon accountType={props.option.type} style={style()}/>
			<span class={css.optionText}>
				<strong class={cn(props.compact && props.option.archived && css.optionMuted)}>{props.option.name}</strong>
				<Show when={!props.compact && props.current && !props.option.archived}>
					<span>Текущий счёт</span>
				</Show>
			</span>
			<Show when={props.option.archived}>
				<Badge class={css.optionBadge}>Архив</Badge>
			</Show>
			<Show when={!props.compact}>
				<span class={css.accountBalance}>
					{formatMinorUnitsCurrency(props.option.balanceMinor, props.option.currency)}
				</span>
			</Show>
		</span>
	);
}
