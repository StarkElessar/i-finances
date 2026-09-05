import {
	getReceiptMerchantName,
	readReceiptReviewFields
} from '@/features/receipt-import/model';

import type { ReceiptImport, ReceiptReview } from '@i-finances/contracts';
import type { AccountCollection } from '@i-finances/contracts';
import { createSignal, Show } from 'solid-js';

import { ReceiptReviewActions } from './receipt-review-actions';
import { ReceiptReviewItemList } from './receipt-review-item-list';
import { ReceiptReviewMerchantForm } from './receipt-review-merchant-form';

export type ReceiptReviewFormProps = {
	accounts: AccountCollection | undefined;
	error: string | undefined;
	isSubmitting: boolean;
	onApprove: (accountId: string) => Promise<void>;
	onRequestRevision: (comment: string) => Promise<void>;
	onSave: (review: ReceiptReview) => Promise<void>;
	receipt: ReceiptImport;
};

export function ReceiptReviewForm(props: ReceiptReviewFormProps) {
	const [formError, setFormError] = createSignal<string>();

	const handleSubmit = async (event: SubmitEvent & { currentTarget: HTMLFormElement }) => {
		event.preventDefault();
		setFormError(undefined);

		const review = readReceiptReviewFields(new FormData(event.currentTarget), props.receipt);

		if (review === undefined) {
			setFormError('Проверьте дату, суммы, названия позиций и категории.');
			return;
		}

		await props.onSave(review);
	};

	return (
		<div class='receipt-review'>
			<Show when={props.receipt.imageUrl}>
				{(imageUrl) => <img alt='Загруженный чек' class='receipt-image' src={imageUrl()}/>}
			</Show>
			<Show when={props.receipt.result} fallback={<p>Worker ещё не вернул результат обработки.</p>}>
				{(result) => (
					<form class='receipt-review-form' onSubmit={handleSubmit}>
						<h3>{getReceiptMerchantName(result())}</h3>
						<ReceiptReviewMerchantForm result={result()}/>
						<ReceiptReviewItemList receipt={props.receipt}/>
						<button disabled={props.isSubmitting} type='submit'>Сохранить исправления</button>
						<ReceiptReviewActions
							accounts={props.accounts}
							isSubmitting={props.isSubmitting}
							onApprove={props.onApprove}
							onRequestRevision={props.onRequestRevision}
						/>
						<Show when={formError() ?? props.error}>
							{(error) => <p class='receipt-error' role='alert'>{error()}</p>}
						</Show>
					</form>
				)}
			</Show>
		</div>
	);
}
