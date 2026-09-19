import css from './receipts-list.module.scss';

import { cn } from '@/shared/lib';

import type { ReceiptImport } from '@/entities/receipt-import';

import { ReceiptText } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';

import {
	formatDateTime,
	formatFileSize,
	formatProcessingDuration
} from '../../lib/format-receipt';
import { ACTIVE_STATUSES, StatusBadge } from '../status-badge/status-badge';

export type ReceiptsListProps = {
	emptyContent: JSX.Element;
	items: readonly ReceiptImport[];
	selectedReceiptId?: string;
	onSelect: (receiptImport: ReceiptImport) => void;
};

export function ReceiptsList(props: ReceiptsListProps) {
	return (
		<Show fallback={<div class={css.empty}>{props.emptyContent}</div>} when={props.items.length > 0}>
			<ul class={css.root}>
				<For each={props.items}>
					{(receiptImport) => (
						<li>
							<button
								aria-current={receiptImport.id === props.selectedReceiptId}
								class={cn(
									css.item,
									receiptImport.id === props.selectedReceiptId && css.itemSelected,
									ACTIVE_STATUSES.has(receiptImport.status) && css.itemProcessing
								)}
								type='button'
								onClick={() => props.onSelect(receiptImport)}
							>
								<span aria-hidden='true' class={css.icon}>
									<ReceiptText size={18}/>
								</span>
								<span class={css.main}>
									<span class={css.titleRow}>
										<span class={css.title}>{receiptImport.imageOriginalName}</span>
										<span class={css.date}>{formatDateTime(receiptImport.createdAt)}</span>
									</span>
									<span class={css.metaRow}>
										<StatusBadge status={receiptImport.status}/>
										<span class={css.size}>
											{formatFileSize(receiptImport.imageSizeBytes)}
										</span>
										<span class={css.processing}>
											{formatProcessingDuration(receiptImport.latestJob)}
											{' · Попытка '}
											{receiptImport.latestJob.attempt}
										</span>
									</span>
								</span>
							</button>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
