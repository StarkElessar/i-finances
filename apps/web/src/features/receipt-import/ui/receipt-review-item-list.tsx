import { formatReceiptAmountInput } from '@/features/receipt-import/model';

import type { ReceiptImport } from '@i-finances/contracts';
import { For } from 'solid-js';

export type ReceiptReviewItemListProps = {
	receipt: ReceiptImport;
};

export function ReceiptReviewItemList(props: ReceiptReviewItemListProps) {
	const result = props.receipt.result;

	if (result === null) {
		return null;
	}

	return (
		<div class='receipt-review-items'>
			<h3>Позиции чека</h3>
			<ol class='receipt-item-list'>
				<For each={result.receipt.items}>
					{(item, index) => {
						const categorizedItem = result.categorizedItems.find(
							(candidate) => candidate.itemIndex === index()
						);

						return (
							<li class='receipt-review-item'>
								<strong>Позиция {index() + 1}</strong>
								<label>
									<span>Название</span>
									<input name={`item-${index()}-name`} required value={item.name}/>
								</label>
								<label>
									<span>Количество</span>
									<input
										inputmode='decimal'
										name={`item-${index()}-quantity`}
										value={item.quantity?.toString() ?? ''}
									/>
								</label>
								<label>
									<span>Цена за единицу</span>
									<input
										inputmode='decimal'
										name={`item-${index()}-unit-price`}
										value={item.unitPriceMinor === null ? '' : formatReceiptAmountInput(item.unitPriceMinor)}
									/>
								</label>
								<label>
									<span>Скидка</span>
									<input
										inputmode='decimal'
										name={`item-${index()}-discount`}
										value={formatReceiptAmountInput(item.discountMinor)}
									/>
								</label>
								<label>
									<span>Итого позиции</span>
									<input
										inputmode='decimal'
										name={`item-${index()}-total`}
										required
										value={formatReceiptAmountInput(item.totalMinor)}
									/>
								</label>
								<label>
									<span>Категория</span>
									<select name={`item-${index()}-category`} value={categorizedItem?.categoryId ?? ''}>
										<option value=''>Без категории</option>
										<For each={props.receipt.categories}>
											{(category) => <option value={category.id}>{category.name}</option>}
										</For>
									</select>
								</label>
							</li>
						);
					}}
				</For>
			</ol>
		</div>
	);
}
