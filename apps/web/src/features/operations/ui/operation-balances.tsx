import css from './operation-balances.module.scss';

import { formatMinorUnits } from '@/features/operations/model';

import type { AccountBalance } from '@i-finances/contracts';
import { For } from 'solid-js';

export type OperationBalancesProps = {
	items: AccountBalance[];
};

export function OperationBalances(props: OperationBalancesProps) {
	return (
		<ul class={css.list}>
			<For each={props.items}>
				{(balance) => (
					<li class={css.item}>
						<span>{balance.accountId}</span>
						<strong>{formatMinorUnits(balance.balanceMinor)} {balance.currency}</strong>
					</li>
				)}
			</For>
		</ul>
	);
}
