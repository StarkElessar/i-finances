import css from './operation-ledger.module.scss';

import { formatMinorUnits } from '@/features/operations/model';

import type { AccountLedger } from '@i-finances/contracts';
import { Show } from 'solid-js';

import { OperationList } from './operation-list';

export type OperationLedgerProps = {
	ledger: AccountLedger | undefined;
	onSelect: OperationLedgerSelectHandler;
};

export type OperationLedgerSelectHandler = (operation: AccountLedger['items'][number]) => void;

export function OperationLedger(props: OperationLedgerProps) {
	return (
		<Show when={props.ledger} fallback={<p>Выберите счёт и период.</p>}>
			{(ledger) => (
				<div class={css.ledger}>
					<div class={css.balanceSummary}>
						<div class={css.balanceCard}>
							<span>Открытие периода</span>
							<strong>{formatMinorUnits(ledger().openingBalanceMinor)} {ledger().accountCurrency}</strong>
						</div>
						<div class={css.balanceCard}>
							<span>Закрытие периода</span>
							<strong>{formatMinorUnits(ledger().closingBalanceMinor)} {ledger().accountCurrency}</strong>
						</div>
					</div>
					<Show when={ledger().items.length > 0} fallback={<p class={css.empty}>Операций за период нет.</p>}>
						<OperationList
							accountCurrency={ledger().accountCurrency}
							items={ledger().items}
							onSelect={props.onSelect}
						/>
					</Show>
				</div>
			)}
		</Show>
	);
}
