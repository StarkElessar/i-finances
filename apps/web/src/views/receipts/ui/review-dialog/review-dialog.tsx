import css from '../../receipts.module.scss';

import { cn } from '@/shared/lib';
import { Button, Dialog } from '@/shared/ui';

import type { PersistedAccount } from '@/entities/account';
import type {
	ReceiptImport,
	ReceiptWorkerResult
} from '@/entities/receipt-import';
import {
	approveReceipt as approveReceiptAction,
	requestReceiptRevision as requestReceiptRevisionAction,
	retryReceiptImport as retryReceiptImportAction
} from '@/entities/receipt-import';

import { useAction, useSubmission } from '@solidjs/router';
import {
	Check,
	Expand,
	RefreshCw,
	RotateCcw,
	TriangleAlert
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show
} from 'solid-js';

import type { EditableOperation } from '../../lib/editable-operation';
import { buildInitialOperations } from '../../lib/editable-operation';
import { formatDateTime, formatProcessingDuration } from '../../lib/format-receipt';
import { StatusBadge } from '../status-badge/status-badge';

function formatMinor(amountMinor: number): string {
	return new Intl.NumberFormat('ru-RU', {
		currency: 'BYN',
		style: 'currency'
	}).format(amountMinor / 100);
}

function getMerchantName(result: ReceiptWorkerResult): string {
	return result.receipt.merchant.displayName
		?? result.receipt.merchant.legalName
		?? 'Продавец не распознан';
}

export type ReviewDialogProps = {
	accounts: readonly PersistedAccount[];
	onOpenChange: (open: boolean) => void;
	onUpdated: () => Promise<void>;
	open: boolean;
	receiptImport: ReceiptImport | undefined;
	onViewImage: () => void;
};

export function ReviewDialog(props: ReviewDialogProps) {
	const [accountId, setAccountId] = createSignal('');
	const [contactId, setContactId] = createSignal<string | null>(null);
	const [comment, setComment] = createSignal('');
	const [error, setError] = createSignal<string>();
	const [editableOperations, setEditableOperations] = createSignal<EditableOperation[]>([]);
	// Version of the receipt the draft was built from: an approval of edits made on a stale draft has to be
	// rejected by the server, not silently stamped with a newer version.
	const [draftVersion, setDraftVersion] = createSignal<number>();
	const runApprove = useAction(approveReceiptAction);
	const runRequestRevision = useAction(requestReceiptRevisionAction);
	const runRetry = useAction(retryReceiptImportAction);
	const approveSubmission = useSubmission(approveReceiptAction);
	const revisionSubmission = useSubmission(requestReceiptRevisionAction);
	const retrySubmission = useSubmission(retryReceiptImportAction);
	const categoryOptions = createMemo(() => props.receiptImport?.categories ?? []);
	// The server validates the chosen contact against the snapshot frozen at upload time,
	// so the picker has to offer exactly that snapshot — not the live household list.
	const contactOptions = createMemo(() => props.receiptImport?.contacts ?? []);
	const operationsTotalMinor = createMemo(() => editableOperations().reduce(
		(sum, operation) => sum + operation.amountMinor,
		0
	));
	// The server rejects an approval whose operation sum differs from the receipt total, so show
	// the drift here instead of letting the user discover it from a rejected submission.
	const totalsMismatchMinor = createMemo(() => {
		const totalAmountMinor = props.receiptImport?.result?.receipt.totalAmountMinor;

		return totalAmountMinor === undefined ? 0 : operationsTotalMinor() - totalAmountMinor;
	});
	const availableAccounts = createMemo(() => (
		props.accounts.filter((account) => account.archivedAt === null)
	));
	const isPending = () => Boolean(
		approveSubmission.pending || revisionSubmission.pending || retrySubmission.pending
	);

	function moveItemToCategory(itemIndex: number, categoryId: string | null): void {
		const receiptImport = props.receiptImport;

		if (receiptImport?.result === undefined || receiptImport.result === null) {
			return;
		}

		const items = receiptImport.result.receipt.items;
		const current = editableOperations();
		const amountMinor = items[itemIndex].totalMinor;
		const remaining = current
			.map((operation) => (
				operation.itemIndexes.includes(itemIndex)
					? {
						...operation,
						amountMinor: operation.amountMinor - amountMinor,
						itemIndexes: operation.itemIndexes.filter((index) => index !== itemIndex)
					}
					: operation
			))
			.filter((operation) => operation.itemIndexes.length > 0);
		const targetGroupKey = categoryId ?? 'uncategorized';
		const existingTarget = remaining.find((operation) => operation.categoryId === categoryId);

		if (existingTarget === undefined) {
			const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));

			remaining.push({
				amountMinor,
				categoryId,
				itemIndexes: [itemIndex],
				title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? targetGroupKey
			});
		}
		else {
			existingTarget.itemIndexes.push(itemIndex);
			existingTarget.amountMinor += amountMinor;
		}

		setEditableOperations(remaining.map((operation) => ({
			...operation,
			itemIndexes: [...operation.itemIndexes].sort((a, b) => a - b)
		})));
	}

	function updateOperationTitle(operationIndex: number, title: string): void {
		setEditableOperations((operations) => operations.map(
			(operation, index) => (index === operationIndex ? { ...operation, title } : operation)
		));
	}

	const getDefaultAccountId = (receiptImport: ReceiptImport): string => (
		receiptImport.accountId
		?? availableAccounts().find((account) => (
			account.currency === receiptImport.result?.receipt.currency
		))?.id
		?? ''
	);

	// The form is a draft owned by the user. The list is polled while receipts are processing and every
	// poll hands over a fresh snapshot of the open receipt, so the draft may only be rebuilt when the
	// dialog opens or the receipt itself moves to another step (`id` or `status`), never on a refetch.
	const syncDefaults = () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined) {
			return;
		}

		setAccountId(getDefaultAccountId(receiptImport));
		setComment(receiptImport.reviewComment);

		if (receiptImport.result !== null) {
			setEditableOperations(buildInitialOperations(receiptImport));
		}

		setContactId(receiptImport.result?.receipt.contactId ?? null);
		setDraftVersion(receiptImport.version);
		setError(undefined);
	};

	const draftKey = createMemo(() => (
		props.open && props.receiptImport !== undefined
			? `${props.receiptImport.id}:${props.receiptImport.status}`
			: undefined
	));

	createEffect(on(draftKey, (key) => {
		if (key !== undefined) {
			syncDefaults();
		}
	}));

	// Accounts can arrive after the dialog has opened; fill the default in only while the user has not
	// picked one yet.
	createEffect(on(availableAccounts, () => {
		const receiptImport = props.receiptImport;

		if (props.open && receiptImport !== undefined && accountId() === '') {
			setAccountId(getDefaultAccountId(receiptImport));
		}
	}));

	const handleOpenChange = (open: boolean) => {
		if (isPending()) {
			return;
		}

		props.onOpenChange(open);
	};

	const handleAccountChange: JSX.EventHandler<HTMLSelectElement, Event> = (
		event
	) => {
		setAccountId(event.currentTarget.value);
		setError(undefined);
	};

	const handleCommentInput: JSX.EventHandler<HTMLTextAreaElement, InputEvent> = (
		event
	) => {
		setComment(event.currentTarget.value);
		setError(undefined);
	};

	const handleApprove = async () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined || !accountId()) {
			setError('Выберите счёт списания.');
			return;
		}

		const result = await runApprove({
			accountId: accountId(),
			contactId: contactId(),
			id: receiptImport.id,
			operations: editableOperations().map((operation) => ({
				amountMinor: operation.amountMinor,
				categoryId: operation.categoryId,
				itemIndexes: operation.itemIndexes,
				title: operation.title
			})),
			version: draftVersion() ?? receiptImport.version
		});

		if (!result.ok) {
			setError(result.message);
			return;
		}

		await props.onUpdated();
		props.onOpenChange(false);
	};

	const handleRequestRevision = async () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined) {
			return;
		}

		if (!comment().trim()) {
			setError('Опишите, что нужно исправить.');
			return;
		}

		const result = await runRequestRevision({
			comment: comment(),
			id: receiptImport.id,
			version: receiptImport.version
		});

		if (!result.ok) {
			setError(result.message);
			return;
		}

		await props.onUpdated();
		props.onOpenChange(false);
	};

	const handleRetry = async () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined) {
			return;
		}

		const result = await runRetry({
			id: receiptImport.id,
			version: receiptImport.version
		});

		if (!result.ok) {
			setError(result.message);
			return;
		}

		await props.onUpdated();
		props.onOpenChange(false);
	};

	return (
		<Dialog.Root open={props.open} onOpenChange={handleOpenChange}>
			<Dialog.Content class={css.reviewDialog}>
				<Dialog.Header closeLabel='Закрыть проверку чека'>
					<Dialog.Kicker>
						{props.receiptImport?.id ?? ''}
					</Dialog.Kicker>
					<Dialog.Title>Проверка чека</Dialog.Title>
					<Dialog.Description>
						Сверьте фотографию с результатом распознавания.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body>
					<Show when={props.receiptImport}>
						{(receiptImport) => (
							<div class={css.reviewBody}>
								<div class={css.reviewImageCard}>
									<Show
										fallback={(
											<div class={css.imageUnavailable}>
												Фото уже удалено
											</div>
										)}
										when={receiptImport().imageUrl}
									>
										{(imageUrl) => (
											<img
												alt='Фотография проверяемого чека'
												src={imageUrl()}
											/>
										)}
									</Show>
									<Button
										disabled={!receiptImport().imageUrl}
										size='sm'
										startIcon={<Expand size={16}/>}
										type='button'
										variant='secondary'
										onClick={props.onViewImage}
									>
										На весь экран
									</Button>
								</div>

								<div class={css.reviewDetails}>
									<div class={css.reviewMeta}>
										<div>
											<span>Статус</span>
											<StatusBadge
												status={receiptImport().status}
											/>
										</div>
										<div>
											<span>Создан</span>
											<strong>
												{formatDateTime(
													receiptImport().createdAt
												)}
											</strong>
										</div>
										<div>
											<span>Попытка</span>
											<strong>
												{receiptImport().latestJob.attempt}
											</strong>
										</div>
										<div>
											<span>Обработка</span>
											<strong>
												{formatProcessingDuration(
													receiptImport().latestJob
												)}
											</strong>
										</div>
									</div>

									<Show
										fallback={(
											<div class={css.pendingResult}>
												<RefreshCw size={22}/>
												<div>
													<strong>
														Результата пока нет
													</strong>
													<p>
														Задача ожидает или уже
														обрабатывается.
													</p>
												</div>
											</div>
										)}
										when={receiptImport().result}
									>
										{(result) => (
											<>
												<div class={css.receiptSummary}>
													<div>
														<span>Продавец</span>
														<strong>
															{getMerchantName(result())}
														</strong>
													</div>
													<div>
														<span>Дата</span>
														<strong>
															{result().receipt.happenedOn}
														</strong>
													</div>
													<div>
														<span>Итого</span>
														<strong>
															{formatMinor(
																result().receipt
																	.totalAmountMinor
															)}
														</strong>
													</div>
												</div>

												<section class={css.operationsPreview}>
													<h3>
														Будущие операции
													</h3>
													<For each={editableOperations()}>
														{(operation, operationIndex) => (
															<article class={css.operationCard}>
																<input
																	class={css.operationTitleInput}
																	value={operation.title}
																	onInput={(event) => updateOperationTitle(
																		operationIndex(),
																		event.currentTarget.value
																	)}
																/>
																<b>{formatMinor(operation.amountMinor)}</b>
																<ul class={css.operationItemList}>
																	<For each={operation.itemIndexes}>
																		{(itemIndex) => (
																			<li>
																				<span>{result().receipt.items[itemIndex].name}</span>
																				<select
																					value={operation.categoryId ?? ''}
																					onChange={(event) => moveItemToCategory(
																						itemIndex,
																						event.currentTarget.value || null
																					)}
																				>
																					<option value=''>Без категории</option>
																					<For each={categoryOptions()}>
																						{(category) => (
																							<option value={category.id}>
																								{category.name}
																							</option>
																						)}
																					</For>
																				</select>
																			</li>
																		)}
																	</For>
																</ul>
															</article>
														)}
													</For>
													<p
														class={cn(
															css.operationsTotal,
															totalsMismatchMinor() !== 0 && css.operationsTotalMismatch
														)}
													>
														<Show
															fallback={<Check aria-hidden='true' size={16}/>}
															when={totalsMismatchMinor() !== 0}
														>
															<TriangleAlert aria-hidden='true' size={16}/>
														</Show>
														<span>
															Сумма операций:
															{' '}
															<b>{formatMinor(operationsTotalMinor())}</b>
															{' · итог чека: '}
															<b>{formatMinor(result().receipt.totalAmountMinor)}</b>
														</span>
														<Show when={totalsMismatchMinor() !== 0}>
															<span>
																{`Расхождение ${
																	totalsMismatchMinor() > 0 ? '+' : '−'
																}${formatMinor(Math.abs(totalsMismatchMinor()))}`}
																{' — подтвердить чек не получится.'}
															</span>
														</Show>
													</p>
												</section>

												<label class={css.selectField}>
													<span>Продавец / контакт</span>
													<select
														value={contactId() ?? ''}
														onChange={(event) => setContactId(event.currentTarget.value || null)}
													>
														<option value=''>Без контакта</option>
														<For each={contactOptions()}>
															{(contact) => (
																<option value={contact.id}>{contact.name}</option>
															)}
														</For>
													</select>
												</label>

												<label class={css.selectField}>
													<span>Счёт списания</span>
													<select
														value={accountId()}
														onChange={handleAccountChange}
													>
														<option value=''>
															Выберите счёт
														</option>
														<For each={availableAccounts()}>
															{(account) => (
																<option
																	value={account.id}
																>
																	{account.name}
																	{' · '}
																	{account.currency}
																</option>
															)}
														</For>
													</select>
												</label>
											</>
										)}
									</Show>

									<label class={css.commentField}>
										<span>Комментарий для доработки</span>
										<textarea
											maxLength={2_000}
											placeholder='Например: неверно распознана вторая позиция...'
											rows={4}
											value={comment()}
											onInput={handleCommentInput}
										/>
									</label>

									<Show
										when={
											receiptImport().latestJob.lastError
										}
									>
										{(lastError) => (
											<p class={css.formError}>
												{lastError()}
											</p>
										)}
									</Show>
									<Show when={error()}>
										<p class={css.formError} role='alert'>
											{error()}
										</p>
									</Show>
								</div>
							</div>
						)}
					</Show>
				</Dialog.Body>
				<Dialog.Footer class={css.reviewFooter}>
					<Dialog.Action
						closeOnClick
						disabled={isPending()}
						intent='cancel'
					>
						Закрыть
					</Dialog.Action>
					<Show when={props.receiptImport?.status === 'failed'}>
						<Button
							disabled={isPending()}
							loading={retrySubmission.pending}
							startIcon={<RefreshCw size={18}/>}
							type='button'
							variant='secondary'
							onClick={() => void handleRetry()}
						>
							Повторить
						</Button>
					</Show>
					<Button
						disabled={
							props.receiptImport?.status !== 'needs_review'
							|| isPending()
						}
						loading={revisionSubmission.pending}
						startIcon={<RotateCcw size={18}/>}
						type='button'
						variant='secondary'
						onClick={() => void handleRequestRevision()}
					>
						На доработку
					</Button>
					<Button
						disabled={
							props.receiptImport?.status !== 'needs_review'
							|| isPending()
						}
						loading={approveSubmission.pending}
						startIcon={<Check size={18}/>}
						type='button'
						onClick={() => void handleApprove()}
					>
						Создать операции
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
