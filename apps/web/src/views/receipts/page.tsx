import css from './receipts.module.scss';

import { cn } from '@/shared/lib';
import type { GridColumn } from '@/shared/ui';
import {
	Button,
	Container,
	Dialog,
	Grid
} from '@/shared/ui';

import type { PersistedAccount } from '@/entities/account';
import { getAccounts } from '@/entities/account/api';
import type {
	ReceiptImport,
	ReceiptImportStatus,
	ReceiptProcessingJob,
	ReceiptWorkerResult
} from '@/entities/receipt-import';
import {
	approveReceipt as approveReceiptAction,
	getReceiptImports,
	requestReceiptRevision as requestReceiptRevisionAction,
	retryReceiptImport as retryReceiptImportAction
} from '@/entities/receipt-import';

import { Title } from '@solidjs/meta';
import {
	createAsync,
	revalidate,
	useAction,
	useSubmission
} from '@solidjs/router';
import {
	Camera,
	Check,
	Expand,
	ReceiptText,
	RefreshCw,
	RotateCcw,
	TriangleAlert,
	Upload
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	ErrorBoundary,
	For,
	onCleanup,
	Show
} from 'solid-js';

type StatusPresentation = {
	label: string;
	tone: 'danger' | 'muted' | 'primary' | 'success' | 'warning';
};

const STATUS_PRESENTATION: Record<
	ReceiptImportStatus,
	StatusPresentation
> = {
	approved: { label: 'Операции созданы', tone: 'success' },
	approving: { label: 'Создаём операции', tone: 'primary' },
	cancelled: { label: 'Отменён', tone: 'muted' },
	failed: { label: 'Ошибка обработки', tone: 'danger' },
	needs_review: { label: 'Нужно проверить', tone: 'warning' },
	processing: { label: 'Обрабатывается', tone: 'primary' },
	queued: { label: 'В очереди', tone: 'muted' },
	revision_requested: { label: 'Отправлен на доработку', tone: 'primary' }
};

const ACTIVE_STATUSES = new Set<ReceiptImportStatus>([
	'approving',
	'processing',
	'queued',
	'revision_requested'
]);

function formatDateTime(value: string): string {
	return new Intl.DateTimeFormat('ru-RU', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(value));
}

function formatFileSize(sizeBytes: number): string {
	return sizeBytes >= 1024 * 1024
		? `${(sizeBytes / 1024 / 1024).toFixed(1)} МБ`
		: `${Math.ceil(sizeBytes / 1024)} КБ`;
}

function formatMinor(amountMinor: number): string {
	return new Intl.NumberFormat('ru-RU', {
		currency: 'BYN',
		style: 'currency'
	}).format(amountMinor / 100);
}

function formatDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
}

// `completedAt` is set for both a successful and a failed attempt, so this is a
// valid total for any terminal job; for one still running it falls back to "now".
function getProcessingDurationMs(job: ReceiptProcessingJob): number {
	const startedAt = new Date(job.createdAt).getTime();
	const endedAt = job.completedAt === null ? Date.now() : new Date(job.completedAt).getTime();

	return endedAt - startedAt;
}

function formatProcessingDuration(job: ReceiptProcessingJob): string {
	const durationLabel = formatDuration(getProcessingDurationMs(job));

	return job.completedAt === null ? `${durationLabel}…` : durationLabel;
}

function getMerchantName(result: ReceiptWorkerResult): string {
	return result.receipt.merchant.displayName
		?? result.receipt.merchant.legalName
		?? 'Продавец не распознан';
}

function StatusBadge(props: { status: ReceiptImportStatus }) {
	const presentation = () => STATUS_PRESENTATION[props.status];

	return (
		<span
			class={cn(
				css.status,
				css[`status-${presentation().tone}`]
			)}
		>
			<Show when={ACTIVE_STATUSES.has(props.status)}>
				<span aria-hidden='true' class={css.statusSpinner}/>
			</Show>
			{presentation().label}
		</span>
	);
}

type UploadDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUploaded: () => Promise<void>;
};

function UploadDialog(props: UploadDialogProps) {
	let imageInput: HTMLInputElement | undefined;
	const [error, setError] = createSignal<string>();
	const [isUploading, setIsUploading] = createSignal(false);
	const [selectedFileName, setSelectedFileName] = createSignal<string>();
	const [uploadDurationMs, setUploadDurationMs] = createSignal<number>();

	const handleOpenChange = (open: boolean) => {
		if (isUploading()) {
			return;
		}

		props.onOpenChange(open);

		if (!open) {
			setError(undefined);
			setSelectedFileName(undefined);
			setUploadDurationMs(undefined);
		}
	};

	const handleFileChange: JSX.EventHandler<HTMLInputElement, Event> = (
		event
	) => {
		setSelectedFileName(event.currentTarget.files?.[0]?.name);
		setError(undefined);
	};

	const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (
		event
	) => {
		event.preventDefault();

		const image = imageInput?.files?.[0];

		if (image === undefined) {
			setError('Выберите фотографию чека.');
			return;
		}

		setError(undefined);
		setIsUploading(true);

		const uploadStartedAt = performance.now();

		try {
			const formData = new FormData();

			formData.set('image', image);

			const response = await fetch('/api/receipt-imports', {
				body: formData,
				method: 'POST'
			});
			const payload = await response.json() as {
				message?: string;
				ok: boolean;
			};

			if (!response.ok || !payload.ok) {
				setError(payload.message ?? 'Не удалось загрузить чек.');
				setIsUploading(false);
				return;
			}

			setUploadDurationMs(performance.now() - uploadStartedAt);
			await props.onUploaded();

			// Keep the success message on screen for a moment instead of closing
			// instantly, so the just-measured upload duration is actually readable.
			await new Promise((resolve) => setTimeout(resolve, 1_200));

			setIsUploading(false);
			handleOpenChange(false);
		}
		catch {
			setError('Не удалось загрузить чек. Проверьте соединение.');
			setIsUploading(false);
		}
	};

	return (
		<Dialog.Root open={props.open} onOpenChange={handleOpenChange}>
			<Dialog.Content as='form' onSubmit={handleSubmit}>
				<Dialog.Header closeLabel='Закрыть загрузку чека'>
					<Dialog.Kicker>Новая задача</Dialog.Kicker>
					<Dialog.Title>Создать из чека</Dialog.Title>
					<Dialog.Description>
						Сфотографируйте чек или выберите готовое изображение.
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body>
					<div class={css.uploadBody}>
						<Show
							fallback={(
								<>
									<label class={css.filePicker}>
										<Camera aria-hidden='true' size={32}/>
										<strong>
											{selectedFileName() ?? 'Выбрать фотографию'}
										</strong>
										<span>JPEG, PNG или HEIC, не больше 15 МБ</span>
										<input
											ref={imageInput}
											accept='image/jpeg,image/png,image/heic,image/heif'
											type='file'
											onChange={handleFileChange}
										/>
									</label>
									<Show when={error()}>
										<p class={css.formError} role='alert'>{error()}</p>
									</Show>
								</>
							)}
							when={uploadDurationMs()}
						>
							{(durationMs) => (
								<div class={css.uploadSuccess}>
									<Check aria-hidden='true' size={22}/>
									<div>
										<strong>
											{`Загружено за ${formatDuration(durationMs())}`}
										</strong>
										<p>Чек поставлен в очередь на обработку.</p>
									</div>
								</div>
							)}
						</Show>
					</div>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Action
						closeOnClick
						disabled={isUploading()}
						intent='cancel'
					>
						Отмена
					</Dialog.Action>
					<Dialog.Action
						loading={isUploading()}
						startIcon={<Upload size={18}/>}
						type='submit'
					>
						Загрузить чек
					</Dialog.Action>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}

type ImageDialogProps = {
	receiptImport: ReceiptImport | undefined;
	onOpenChange: (open: boolean) => void;
	open: boolean;
};

function ImageDialog(props: ImageDialogProps) {
	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content class={css.imageDialog}>
				<Dialog.Header closeLabel='Закрыть фотографию'>
					<Dialog.Title>Фото чека</Dialog.Title>
					<Dialog.Description>
						{props.receiptImport?.imageOriginalName ?? ''}
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Body class={css.imageDialogBody}>
					<Show when={props.receiptImport?.imageUrl}>
						{(imageUrl) => (
							<img
								alt='Фотография чека'
								class={css.fullImage}
								src={imageUrl()}
							/>
						)}
					</Show>
				</Dialog.Body>
			</Dialog.Content>
		</Dialog.Root>
	);
}

type ReviewDialogProps = {
	accounts: readonly PersistedAccount[];
	onOpenChange: (open: boolean) => void;
	onUpdated: () => Promise<void>;
	open: boolean;
	receiptImport: ReceiptImport | undefined;
	onViewImage: () => void;
};

type EditableOperation = {
	amountMinor: number;
	categoryId: string | null;
	itemIndexes: number[];
	title: string;
};

function buildInitialOperations(receiptImport: ReceiptImport): EditableOperation[] {
	const result = receiptImport.result;

	if (result === null) {
		return [];
	}

	const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));
	const groups = new Map<string, EditableOperation>();

	result.receipt.items.forEach((item, itemIndex) => {
		const categoryId = result.categorizedItems.find((entry) => entry.itemIndex === itemIndex)?.categoryId ?? null;
		const groupKey = categoryId ?? 'uncategorized';
		const group = groups.get(groupKey) ?? {
			amountMinor: 0,
			categoryId,
			itemIndexes: [],
			title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? 'Без категории'
		};

		group.amountMinor += item.totalMinor;
		group.itemIndexes.push(itemIndex);
		groups.set(groupKey, group);
	});

	// Zero-amount groups stay: a promo line priced at 0 still has to be visible so the
	// user can move it into another group or approve it as a zero-amount operation.
	return [...groups.values()];
}

function ReviewDialog(props: ReviewDialogProps) {
	const [accountId, setAccountId] = createSignal('');
	const [contactId, setContactId] = createSignal<string | null>(null);
	const [comment, setComment] = createSignal('');
	const [error, setError] = createSignal<string>();
	const [editableOperations, setEditableOperations] = createSignal<EditableOperation[]>([]);
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

		if (existingTarget !== undefined) {
			existingTarget.itemIndexes.push(itemIndex);
			existingTarget.amountMinor += amountMinor;
		}
		else {
			const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));

			remaining.push({
				amountMinor,
				categoryId,
				itemIndexes: [itemIndex],
				title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? targetGroupKey
			});
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

	const syncDefaults = () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined) {
			return;
		}

		setAccountId(
			receiptImport.accountId
			?? availableAccounts().find((account) => (
				account.currency === receiptImport.result?.receipt.currency
			))?.id
			?? ''
		);
		setComment(receiptImport.reviewComment);

		if (receiptImport.result !== null) {
			setEditableOperations(buildInitialOperations(receiptImport));
		}

		setContactId(receiptImport.result?.receipt.contactId ?? null);
		setError(undefined);
	};

	createEffect(() => {
		if (props.open && props.receiptImport !== undefined) {
			syncDefaults();
		}
	});

	const handleOpenChange = (open: boolean) => {
		if (isPending()) {
			return;
		}

		props.onOpenChange(open);

		if (open) {
			syncDefaults();
		}
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
			version: receiptImport.version
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
																							<option value={category.id}>{category.name}</option>
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

function ReceiptsContent() {
	const receiptImports = createAsync(() => getReceiptImports());
	const accounts = createAsync(() => getAccounts(false));
	const [isUploadOpen, setIsUploadOpen] = createSignal(false);
	const [isReviewOpen, setIsReviewOpen] = createSignal(false);
	const [isImageOpen, setIsImageOpen] = createSignal(false);
	const [selectedReceiptId, setSelectedReceiptId] = createSignal<string>();
	const selectedReceipt = createMemo(() => (
		receiptImports()?.find((item) => item.id === selectedReceiptId())
	));

	const handleRefresh = async () => {
		await Promise.all([
			revalidate(getReceiptImports.key),
			revalidate(getAccounts.key)
		]);
	};

	const POLL_INTERVAL_MS = 2_500;

	createEffect(() => {
		const hasActiveReceipt = (receiptImports() ?? []).some(
			(receiptImport) => ACTIVE_STATUSES.has(receiptImport.status)
		);

		if (!hasActiveReceipt) {
			return;
		}

		const timer = setInterval(() => {
			void handleRefresh();
		}, POLL_INTERVAL_MS);

		onCleanup(() => clearInterval(timer));
	});

	const handleOpenReceipt = (receiptImport: ReceiptImport) => {
		setSelectedReceiptId(receiptImport.id);
		setIsReviewOpen(true);
	};

	const handleViewImage = (receiptImport: ReceiptImport) => {
		setSelectedReceiptId(receiptImport.id);
		setIsImageOpen(true);
	};

	const columns: GridColumn<ReceiptImport>[] = [
		{
			accessor: (row) => row.id,
			header: 'ID',
			id: 'id',
			width: 280,
			clientTemplate: ({ dataItem }) => (
				<code class={css.receiptId}>{dataItem.id}</code>
			)
		},
		{
			accessor: (row) => row.createdAt,
			header: 'Дата создания',
			id: 'createdAt',
			width: 190,
			clientTemplate: ({ dataItem }) => (
				formatDateTime(dataItem.createdAt)
			)
		},
		{
			accessor: (row) => row.imageOriginalName,
			header: 'Фото',
			id: 'image',
			width: 220,
			clientTemplate: ({ dataItem }) => (
				<div class={css.fileCell}>
					<div>
						<strong>{dataItem.imageOriginalName}</strong>
						<span>{formatFileSize(dataItem.imageSizeBytes)}</span>
					</div>
					<Button
						aria-label='Открыть фотографию на весь экран'
						disabled={dataItem.imageUrl === null}
						iconOnly
						size='sm'
						type='button'
						variant='ghost'
						onClick={(event) => {
							event.stopPropagation();
							handleViewImage(dataItem);
						}}
					>
						<Expand size={17}/>
					</Button>
				</div>
			)
		},
		{
			accessor: (row) => row.status,
			header: 'Статус',
			id: 'status',
			width: 220,
			clientTemplate: ({ dataItem }) => (
				<StatusBadge status={dataItem.status}/>
			)
		},
		{
			accessor: (row) => getProcessingDurationMs(row.latestJob),
			header: 'Обработка',
			id: 'duration',
			width: 140,
			clientTemplate: ({ dataItem }) => (
				formatProcessingDuration(dataItem.latestJob)
			)
		},
		{
			accessor: (row) => row.latestJob.attempt,
			header: 'Попытка',
			id: 'attempt',
			width: 100
		}
	];

	return (
		<main class={css.root}>
			<Container class={css.page}>
				<header class={css.header}>
					<div class={css.headerContent}>
						<div class={css.titleRow}>
							<ReceiptText aria-hidden='true' size={28}/>
							<h1>Чеки</h1>
						</div>
						<p>
							Загрузите фотографию, дождитесь результата и проверьте
							будущие операции.
						</p>
					</div>
					<div class={css.headerActions}>
						<Button
							aria-label='Обновить задачи'
							iconOnly
							type='button'
							variant='secondary'
							onClick={() => void handleRefresh()}
						>
							<RefreshCw size={18}/>
						</Button>
						<Button
							startIcon={<Camera size={18}/>}
							type='button'
							onClick={() => setIsUploadOpen(true)}
						>
							Создать из чека
						</Button>
					</div>
				</header>

				<Grid
					aria-label='Задачи по обработке чеков'
					columns={columns}
					data={receiptImports() ?? []}
					emptyContent={(
						<div class={css.emptyState}>
							<ReceiptText size={32}/>
							<strong>Загруженных чеков пока нет</strong>
							<span>
								Нажмите «Создать из чека», чтобы добавить первый.
							</span>
						</div>
					)}
					getRowAriaLabel={(row) => (
						`Открыть чек ${row.id}, ${
							STATUS_PRESENTATION[row.status].label
						}`
					)}
					getRowClass={(row) => (
						ACTIVE_STATUSES.has(row.status)
							? css.processingRow
							: undefined
					)}
					getRowKey={(row) => row.id}
					isRowSelected={(row) => (
						isReviewOpen() && row.id === selectedReceiptId()
					)}
					onRowClick={handleOpenReceipt}
				/>
			</Container>

			<UploadDialog
				open={isUploadOpen()}
				onOpenChange={setIsUploadOpen}
				onUploaded={handleRefresh}
			/>
			<ReviewDialog
				accounts={accounts() ?? []}
				open={isReviewOpen()}
				receiptImport={selectedReceipt()}
				onOpenChange={setIsReviewOpen}
				onUpdated={handleRefresh}
				onViewImage={() => setIsImageOpen(true)}
			/>
			<ImageDialog
				open={isImageOpen()}
				receiptImport={selectedReceipt()}
				onOpenChange={setIsImageOpen}
			/>
		</main>
	);
}

function ReceiptsLoadError() {
	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.loadError}>
					<h1>Не удалось загрузить задачи по чекам</h1>
					<p>Обновите страницу и повторите попытку.</p>
				</div>
			</Container>
		</main>
	);
}

/**
 * Renders receipt uploads, processing status and manual review.
 */
export function ReceiptsPage() {
	return (
		<>
			<Title>Чеки — iFinances</Title>
			<ErrorBoundary fallback={<ReceiptsLoadError/>}>
				<ReceiptsContent/>
			</ErrorBoundary>
		</>
	);
}
