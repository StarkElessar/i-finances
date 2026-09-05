import css from './operation-list.module.scss';

import { formatMinorUnits, formatOperationAmount } from '@/features/operations/model';

import type { OperationWithBalance } from '@i-finances/contracts';
import { For } from 'solid-js';

export type OperationListProps = {
	accountCurrency: string;
	items: OperationWithBalance[];
	onSelect: (operation: OperationWithBalance) => void;
};

export function OperationList(props: OperationListProps) {
	return (
		<div class={css.wrapper}>
			<table class={css.table}>
				<thead>
					<tr>
						<th scope='col'>Дата</th>
						<th scope='col'>Название</th>
						<th scope='col'>Категория</th>
						<th scope='col'>Контакт</th>
						<th scope='col'>Сумма</th>
						<th scope='col'>Баланс</th>
					</tr>
				</thead>
				<tbody>
					<For each={props.items}>
						{(item) => (
							<tr
								aria-label={`Операция ${item.title}`}
								class={css.row}
								tabIndex={0}
								onClick={() => props.onSelect(item)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										props.onSelect(item);
									}
								}}
							>
								<td class={css.date}>{item.happenedOn}</td>
								<td>
									<strong class={css.title}>{item.title}</strong>
									<small class={css.secondary}>{item.comment || 'Без комментария'}</small>
								</td>
								<td class={css.category}>{item.categoryName ?? 'Без категории'}</td>
								<td class={css.contact}>{item.contactName ?? 'Без контакта'}</td>
								<td class={`${css.amount} ${item.type === 'income' ? css.income : css.expense}`}>
									{formatOperationAmount(item.amountMinor, item.currency, item.type)}
								</td>
								<td class={css.balance}>{formatMinorUnits(item.balanceAfterMinor)} {props.accountCurrency}</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	);
}
