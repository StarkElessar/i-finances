import { formatMinorUnitsCurrency } from '@/shared/lib';
import { Banner } from '@/shared/ui/banner';
import { List, ListRow } from '@/shared/ui/list';

import type { Operation } from '@/entities/operation';

import { ArrowLeftRight } from 'lucide-solid';

import { formatDateKey } from './lib/format-date-key';

type TransferPartSummaryProps = {
	operation: Operation;
};

/**
 * Body of the edit form for an operation that is one leg of a transfer: such an operation cannot be edited, so there is
 * no «Счёт» field, only what it holds (boards `M-OpMoveAccount`, `D-OpMoveAccount`, «Операция-часть перевода»).
 */
export function TransferPartSummary(props: TransferPartSummaryProps) {
	const signedAmountMinor = () => (
		props.operation.type === 'expense' ? -props.operation.amountMinor : props.operation.amountMinor
	);

	return (
		<>
			<Banner icon={<ArrowLeftRight size={16}/>} title='Это часть перевода между счетами.' tone='info'>
				Изменить такую операцию нельзя, поле «Счёт» не показывается.
			</Banner>
			<List aria-label='Операция'>
				<ListRow meta='Дата' title={formatDateKey(props.operation.happenedOn)}/>
				<ListRow meta='Сумма' title={formatMinorUnitsCurrency(signedAmountMinor(), props.operation.currency)}/>
				<ListRow meta='Название' title={props.operation.title}/>
			</List>
		</>
	);
}
