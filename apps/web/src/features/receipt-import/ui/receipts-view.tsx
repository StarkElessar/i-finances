import type { AccountClient } from '@/features/accounts';
import type { ReceiptImportClient } from '@/features/receipt-import/api';
import { resolveReceiptError } from '@/features/receipt-import/lib';
import { receiptStatusLabels } from '@/features/receipt-import/model';

import type { AccountCollection, ReceiptReview } from '@i-finances/contracts';
import { createResource, createSignal, Show } from 'solid-js';

import { ReceiptList } from './receipt-list';
import { ReceiptReviewForm } from './receipt-review-form';
import { ReceiptUploadForm } from './receipt-upload-form';

export type ReceiptsViewProps = {
	accountClient: AccountClient;
	client: ReceiptImportClient;
};

export function ReceiptsView(props: ReceiptsViewProps) {
	const [receipts, { refetch }] = createResource(() => props.client.list());
	const [accounts] = createResource<AccountCollection>(() => props.accountClient.list());
	const [selectedId, setSelectedId] = createSignal<string>();
	const [message, setMessage] = createSignal<string>();
	const [error, setError] = createSignal<string>();
	const [isSubmitting, setIsSubmitting] = createSignal(false);

	const selectedReceipt = () => receipts()?.find((receipt) => receipt.id === selectedId());

	const handleUpload = async (image: File) => {
		setError(undefined);
		setMessage(undefined);

		try {
			const result = await props.client.create(image);
			setSelectedId(result.receiptImport.id);
			setMessage('Чек добавлен в очередь обработки.');
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveReceiptError(caughtError));
		}
	};

	const handleApprove = async (accountId: string) => {
		const receipt = selectedReceipt();

		if (receipt === undefined) {
			return;
		}

		setError(undefined);
		setIsSubmitting(true);

		try {
			const result = await props.client.approve({
				accountId,
				id: receipt.id,
				version: receipt.version
			});

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage('Операции по чеку созданы.');
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveReceiptError(caughtError));
		}
		finally {
			setIsSubmitting(false);
		}
	};

	const handleRevision = async (comment: string) => {
		const receipt = selectedReceipt();

		if (receipt === undefined) {
			return;
		}

		setError(undefined);
		setIsSubmitting(true);

		try {
			const result = await props.client.requestRevision({
				comment,
				id: receipt.id,
				version: receipt.version
			});

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage('Повторная обработка поставлена в очередь.');
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveReceiptError(caughtError));
		}
		finally {
			setIsSubmitting(false);
		}
	};

	const handleSaveReview = async (review: ReceiptReview) => {
		const receipt = selectedReceipt();

		if (receipt === undefined) {
			return;
		}

		setError(undefined);
		setMessage(undefined);
		setIsSubmitting(true);

		try {
			const result = await props.client.updateReview({
				id: receipt.id,
				review,
				version: receipt.version
			});

			if (!result.ok) {
				setError(result.message);
				return;
			}

			setMessage('Исправления чека сохранены.');
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveReceiptError(caughtError));
		}
		finally {
			setIsSubmitting(false);
		}
	};

	return (
		<section aria-labelledby='receipts-title' class='receipts-panel'>
			<div class='section-heading'>
				<div>
					<p class='eyebrow'>Review-first импорт</p>
					<h2 id='receipts-title'>Чеки</h2>
				</div>
			</div>
			<ReceiptUploadForm onUpload={handleUpload}/>
			<Show when={message()}>
				{(currentMessage) => <p class='receipt-success' role='status'>{currentMessage()}</p>}
			</Show>
			<Show when={error()}>
				{(currentError) => <p class='receipt-error' role='alert'>{currentError()}</p>}
			</Show>
			<Show when={!receipts.loading} fallback={<p role='status'>Загрузка чеков…</p>}>
				<Show when={receipts()} fallback={<p role='alert'>Не удалось загрузить чеки.</p>}>
					{(collection) => (
						<ReceiptList items={collection()} onSelect={(receipt) => setSelectedId(receipt.id)} selectedId={selectedId()}/>
					)}
				</Show>
			</Show>
			<Show when={selectedReceipt()}>
				{(receipt) => (
					<>
						<p class='receipt-state'>Статус: {receiptStatusLabels[receipt().status]}</p>
						<Show
							fallback={<p>Ожидайте результата worker’а. Автоматические операции не создаются.</p>}
							when={receipt().status === 'needs_review'}
						>
							<ReceiptReviewForm
								accounts={accounts()}
								error={error()}
								isSubmitting={isSubmitting()}
								onApprove={handleApprove}
								onRequestRevision={handleRevision}
								onSave={handleSaveReview}
								receipt={receipt()}
							/>
						</Show>
					</>
				)}
			</Show>
		</section>
	);
}
