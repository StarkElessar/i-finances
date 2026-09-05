import { formatReceiptAmount, getReceiptMerchantName, receiptStatusLabels } from '@/features/receipt-import/model';

import type { ReceiptImport } from '@i-finances/contracts';
import { For, Show } from 'solid-js';

export type ReceiptListProps = {
	items: ReceiptImport[];
	onSelect: (receipt: ReceiptImport) => void;
	selectedId: string | undefined;
};

export function ReceiptList(props: ReceiptListProps) {
	return (
		<Show when={props.items.length > 0} fallback={<p>Чеков пока нет.</p>}>
			<ul class='receipt-list'>
				<For each={props.items}>
					{(receipt) => (
						<li>
							<button
								class={`receipt-list-item${props.selectedId === receipt.id ? ' receipt-list-item-selected' : ''}`}
								onClick={() => props.onSelect(receipt)}
								type='button'
							>
								<strong>
									{receipt.result === null ? receipt.imageOriginalName : getReceiptMerchantName(receipt.result)}
								</strong>
								<small>{receiptStatusLabels[receipt.status]}</small>
								<Show when={receipt.result}>
									{(result) => (
										<span>
											{formatReceiptAmount(result().receipt.totalAmountMinor)} · {result().receipt.happenedOn}
										</span>
									)}
								</Show>
							</button>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
