import css from './receipts.module.scss';

import type { GridColumn } from '@/shared/ui';
import {
	Button,
	Container,
	Dialog,
	Grid
} from '@/shared/ui';

import { getAccounts } from '@/entities/account/api';
import type { ReceiptImport } from '@/entities/receipt-import';
import { getReceiptImports, useReceiptsDisplayMode } from '@/entities/receipt-import';

import { Title } from '@solidjs/meta';
import { createAsyncStore, revalidate } from '@solidjs/router';
import {
	Camera,
	Check,
	Expand,
	ReceiptText,
	RefreshCw,
	Upload
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import {
	createEffect,
	createMemo,
	createSignal,
	ErrorBoundary,
	onCleanup,
	Show
} from 'solid-js';

import {
	formatDateTime,
	formatDuration,
	formatFileSize,
	formatProcessingDuration,
	getProcessingDurationMs
} from './lib/format-receipt';
import { ReceiptsList } from './ui/receipts-list/receipts-list';
import { ReviewDialog } from './ui/review-dialog/review-dialog';
import { ACTIVE_STATUSES, STATUS_PRESENTATION, StatusBadge } from './ui/status-badge/status-badge';

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

function ReceiptsContent() {
	// A store reconciled by `id` keeps the identity of every unchanged receipt, account and contact across
	// polls. A plain `createAsync` hands over a fresh object graph each time, which re-creates the rows,
	// photos and <option> lists and resets the open review form.
	const receiptImports = createAsyncStore(() => getReceiptImports(), { reconcile: { key: 'id' } });
	const accounts = createAsyncStore(() => getAccounts(false), { reconcile: { key: 'id' } });
	const { resolvedMode } = useReceiptsDisplayMode();
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

	// Accounts do not change while receipts are processed, only the receipt list does.
	const handlePoll = () => revalidate(getReceiptImports.key);

	const POLL_INTERVAL_MS = 2_500;

	createEffect(() => {
		const hasActiveReceipt = (receiptImports() ?? []).some(
			(receiptImport) => ACTIVE_STATUSES.has(receiptImport.status)
		);

		if (!hasActiveReceipt) {
			return;
		}

		const timer = setInterval(() => {
			void handlePoll();
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

	const emptyReceiptsContent = (
		<div class={css.emptyState}>
			<ReceiptText size={32}/>
			<strong>Загруженных чеков пока нет</strong>
			<span>
				Нажмите «Создать из чека», чтобы добавить первый.
			</span>
		</div>
	);

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

				<Show
					fallback={(
						<ReceiptsList
							emptyContent={emptyReceiptsContent}
							items={receiptImports() ?? []}
							selectedReceiptId={isReviewOpen() ? selectedReceiptId() : undefined}
							onSelect={handleOpenReceipt}
						/>
					)}
					when={resolvedMode() === 'table'}
				>
					<Grid
						aria-label='Задачи по обработке чеков'
						class={css.grid}
						columns={columns}
						data={receiptImports() ?? []}
						emptyContent={emptyReceiptsContent}
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
				</Show>
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
