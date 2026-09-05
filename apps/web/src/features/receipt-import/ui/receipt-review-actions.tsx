import type { AccountCollection } from '@i-finances/contracts';
import { createSignal, For, Show } from 'solid-js';

export type ReceiptReviewActionsProps = {
	accounts: AccountCollection | undefined;
	isSubmitting: boolean;
	onApprove: (accountId: string) => Promise<void>;
	onRequestRevision: (comment: string) => Promise<void>;
};

export function ReceiptReviewActions(props: ReceiptReviewActionsProps) {
	const [accountId, setAccountId] = createSignal('');
	const [comment, setComment] = createSignal('');

	const handleRevision = async () => {
		const value = comment().trim();

		if (value.length === 0) {
			return;
		}

		await props.onRequestRevision(value);
	};

	return (
		<div class='receipt-review-actions'>
			<label>
				<span>Счёт для операций</span>
				<select onChange={(event) => setAccountId(event.currentTarget.value)} value={accountId()}>
					<option value=''>Выберите счёт</option>
					<For each={props.accounts?.items ?? []}>
						{(account) => <option value={account.id}>{account.name} · {account.currency}</option>}
					</For>
				</select>
			</label>
			<button
				disabled={props.isSubmitting || accountId().length === 0}
				onClick={() => void props.onApprove(accountId())}
				type='button'
			>
				Подтвердить и создать операции
			</button>
			<div class='receipt-revision-fields'>
				<label>
					<span>Что исправить при повторной обработке</span>
					<textarea maxlength='2000' onInput={(event) => setComment(event.currentTarget.value)} value={comment()}/>
				</label>
				<button
					class='secondary-button'
					disabled={props.isSubmitting || comment().trim().length === 0}
					onClick={() => void handleRevision()}
					type='button'
				>
					Запросить повторную обработку
				</button>
			</div>
			<Show when={props.accounts === undefined}>
				<p>Загрузка счетов…</p>
			</Show>
		</div>
	);
}
