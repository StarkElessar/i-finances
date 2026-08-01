import css from './categories.module.scss';

import { Title } from '@solidjs/meta';
import {
	createAsync,
	revalidate,
	useAction,
	useSubmission
} from '@solidjs/router';
import {
	Archive,
	Layers,
	Plus,
	RefreshCw
} from 'lucide-solid';
import type { Accessor } from 'solid-js';
import {
	createMemo,
	createSignal,
	ErrorBoundary,
	For,
	Show
} from 'solid-js';

import { CategoryCard } from './ui/category-card';
import type { CategoryDialogMode, CategoryDialogValue } from './ui/category-dialog';
import { CategoryDialog } from './ui/category-dialog';

import type {
	CategoryBudgetSummary,
	CategoryCollection,
	PersistedCategory
} from '~/entities/category';
import {
	archiveCategory as archiveCategoryAction,
	createCategory as createCategoryAction,
	getCategories,
	getCategoryBudgetSummary,
	restoreCategory as restoreCategoryAction,
	updateCategory as updateCategoryAction
} from '~/entities/category';
import type { MonthlyExpenseSummary } from '~/entities/operation';
import {
	formatLocalDateKey,
	getMonthlyExpenseSummary
} from '~/entities/operation';
import { cn, CurrencyCode } from '~/shared/lib';
import { Button, Container } from '~/shared/ui';
import { createDragAction, DragAction } from '~/shared/ui/drag-action';

type CategoryListMode = 'active' | 'archive';

type CategoriesContentProps = {
	collection: Accessor<CategoryCollection | undefined>;
	monthlySummary: Accessor<MonthlyExpenseSummary | undefined>;
};

function getCurrentMonthKey(): string {
	return formatLocalDateKey(new Date()).slice(0, 7);
}

function toDialogValue(category: PersistedCategory): CategoryDialogValue {
	return {
		color: category.color,
		description: category.description,
		keywords: category.keywords,
		monthlyBudgetMinor: category.monthlyBudgetMinor,
		name: category.name
	};
}

function getCategorySummary(
	summaries: ReadonlyMap<string, CategoryBudgetSummary>,
	categoryId: string
): CategoryBudgetSummary {
	const summary = summaries.get(categoryId);

	if (summary === undefined) {
		throw new Error(`Category summary not found: ${categoryId}`);
	}

	return summary;
}

function CategoryGridSkeleton() {
	return (
		<div aria-label='Загрузка категорий' class={css.grid} role='status'>
			<For each={Array.from({ length: 6 })}>
				{() => <div class={css.skeletonCard}/>}
			</For>
		</div>
	);
}

type CategoriesLoadErrorProps = {
	onRetry: () => void;
};

function CategoriesLoadError(props: CategoriesLoadErrorProps) {
	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.loadError}>
					<div>
						<h1>Не удалось загрузить категории</h1>
						<p>Проверьте подключение и повторите попытку.</p>
					</div>
					<Button
						startIcon={<RefreshCw size={18}/>}
						type='button'
						variant='secondary'
						onClick={props.onRetry}
					>
						Повторить
					</Button>
				</div>
			</Container>
		</main>
	);
}

function CategoriesContent(props: CategoriesContentProps) {
	const [editingCategoryId, setEditingCategoryId] = createSignal<string>();
	const [isCategoryDialogOpen, setIsCategoryDialogOpen] = createSignal(false);
	const [listMode, setListMode] = createSignal<CategoryListMode>('active');
	const [dialogError, setDialogError] = createSignal<string>();
	const [dialogFieldErrors, setDialogFieldErrors]
		= createSignal<Record<string, string>>();
	const [pageError, setPageError] = createSignal<string>();
	const runArchiveCategory = useAction(archiveCategoryAction);
	const runCreateCategory = useAction(createCategoryAction);
	const runRestoreCategory = useAction(restoreCategoryAction);
	const runUpdateCategory = useAction(updateCategoryAction);
	const archiveSubmission = useSubmission(archiveCategoryAction);
	const createSubmission = useSubmission(createCategoryAction);
	const restoreSubmission = useSubmission(restoreCategoryAction);
	const updateSubmission = useSubmission(updateCategoryAction);

	const categories = () => props.collection()?.items ?? [];
	const currency = () => (
		props.monthlySummary()?.baseCurrency
		?? props.collection()?.baseCurrency
		?? CurrencyCode.BYN
	);
	const isLoaded = () => (
		props.collection() !== undefined
		&& props.monthlySummary() !== undefined
	);
	const isLoading = () => !isLoaded();
	const isDialogMutationPending = () => Boolean(
		createSubmission.pending || updateSubmission.pending
	);
	const activeCategories = createMemo(() => (
		categories().filter((category) => category.archivedAt === null)
	));
	const archivedCategories = createMemo(() => (
		categories().filter((category) => category.archivedAt !== null)
	));
	const visibleCategories = createMemo(() => (
		listMode() === 'active' ? activeCategories() : archivedCategories()
	));
	const editableCategory = createMemo(() => {
		const categoryId = editingCategoryId();

		return categoryId === undefined
			? undefined
			: categories().find((category) => category.id === categoryId);
	});
	const categoryDialogMode = createMemo<CategoryDialogMode>(() => (
		editableCategory() ? 'edit' : 'create'
	));
	const categoryDialogInitialValue = createMemo(() => {
		const category = editableCategory();

		return category ? toDialogValue(category) : undefined;
	});
	const categorySummaries = createMemo(() => {
		const expenses = props.monthlySummary()?.categoryExpensesMinor ?? {};

		return new Map(categories().map((category) => [
			category.id,
			getCategoryBudgetSummary(category, expenses[category.id] ?? 0)
		]));
	});

	const resetDialogErrors = () => {
		setDialogError(undefined);
		setDialogFieldErrors(undefined);
	};

	const handleOpenCreateDialog = () => {
		setEditingCategoryId(undefined);
		resetDialogErrors();
		setIsCategoryDialogOpen(true);
	};

	const handleOpenEditDialog = (categoryId: string) => {
		setEditingCategoryId(categoryId);
		resetDialogErrors();
		setIsCategoryDialogOpen(true);
	};

	const handleArchiveCategory = async (categoryId: string) => {
		const category = categories().find((item) => item.id === categoryId);

		if (category === undefined || category.archivedAt !== null) {
			return;
		}

		setPageError(undefined);

		try {
			const result = await runArchiveCategory({
				id: category.id,
				version: category.version
			});

			if (!result.ok) {
				setPageError(result.message);
			}
		}
		catch {
			setPageError(
				'Не удалось отправить категорию в архив. Повторите попытку.'
			);
		}
	};

	const archiveDragAction = createDragAction({
		onDrop: (categoryId) => {
			void handleArchiveCategory(categoryId);
		}
	});

	const handleCategoryClick = (categoryId: string) => {
		if (archiveDragAction.consumeClick(categoryId)) {
			return;
		}

		handleOpenEditDialog(categoryId);
	};

	const handleCategoryDialogOpenChange = (open: boolean) => {
		if (isDialogMutationPending() || restoreSubmission.pending) {
			return;
		}

		setIsCategoryDialogOpen(open);

		if (!open) {
			setEditingCategoryId(undefined);
			resetDialogErrors();
		}
	};

	const handleCategorySubmit = async (value: CategoryDialogValue) => {
		const category = editableCategory();

		resetDialogErrors();

		try {
			const result = category
				? await runUpdateCategory({
					...value,
					id: category.id,
					version: category.version
				})
				: await runCreateCategory(value);

			if (result.ok) {
				setListMode('active');
				setIsCategoryDialogOpen(false);
				setEditingCategoryId(undefined);
				return;
			}

			setDialogError(result.message);
			setDialogFieldErrors(result.fieldErrors);
		}
		catch {
			setDialogError(
				'Не удалось сохранить категорию. Проверьте подключение и повторите попытку.'
			);
		}
	};

	const handleRestoreCategory = async () => {
		const category = editableCategory();

		if (category === undefined || category.archivedAt === null) {
			return;
		}

		resetDialogErrors();

		try {
			const result = await runRestoreCategory({
				id: category.id,
				version: category.version
			});

			if (result.ok) {
				setListMode('active');
				setIsCategoryDialogOpen(false);
				setEditingCategoryId(undefined);
				return;
			}

			setDialogError(result.message);
			setDialogFieldErrors(result.fieldErrors);
		}
		catch {
			setDialogError(
				'Не удалось восстановить категорию. Повторите попытку.'
			);
		}
	};

	return (
		<>
			<main class={css.root}>
				<Container class={css.page}>
					<Title>Категории</Title>
					<header class={css.header}>
						<div class={css.headerContent}>
							<h1 class={css.title}>Категории</h1>
							<p class={css.description}>Бюджеты семьи на месяц и фактические траты</p>
						</div>
						<Button
							aria-label='Добавить категорию'
							class={css.addButton}
							disabled={isLoading()}
							iconOnly
							size='lg'
							type='button'
							onClick={handleOpenCreateDialog}
						>
							<Plus size={22} strokeWidth={2.5}/>
						</Button>
					</header>

					<Show when={isLoaded()}>
						<div
							aria-label='Состояние категорий'
							class={css.segmented}
							role='group'
						>
							<button
								aria-pressed={listMode() === 'active'}
								class={cn(
									css.segment,
									listMode() === 'active' && css.segmentActive
								)}
								tabIndex={listMode() === 'active' ? -1 : 0}
								type='button'
								onClick={() => setListMode('active')}
							>
								<Layers size={16}/>
								Активные
								<span class={css.count}>{activeCategories().length}</span>
							</button>
							<button
								aria-pressed={listMode() === 'archive'}
								class={cn(
									css.segment,
									listMode() === 'archive' && css.segmentActive
								)}
								tabIndex={listMode() === 'archive' ? -1 : 0}
								type='button'
								onClick={() => setListMode('archive')}
							>
								<Archive size={16}/>
								Архив
								<span class={css.count}>{archivedCategories().length}</span>
							</button>
						</div>
					</Show>

					<Show when={pageError()}>
						<p class={css.pageError} role='alert'>{pageError()}</p>
					</Show>

					<Show fallback={<CategoryGridSkeleton/>} when={isLoaded()}>
						<Show
							fallback={(
								<div class={css.emptyState}>
									<strong>
										{listMode() === 'archive'
											? 'Архив категорий пуст'
											: 'Категорий пока нет'}
									</strong>
									<span>
										{listMode() === 'archive'
											? 'Сюда попадут категории, отправленные в архив'
											: 'Добавьте первую категорию вручную'}
									</span>
									<Show when={listMode() === 'active'}>
										<Button
											type='button'
											onClick={handleOpenCreateDialog}
										>
											Добавить категорию
										</Button>
									</Show>
								</div>
							)}
							when={visibleCategories().length > 0}
						>
							<div class={css.grid}>
								<For each={visibleCategories()}>
									{(category) => {
										const isDraggable = () => (
											category.archivedAt === null
											&& !archiveSubmission.pending
										);

										return (
											<CategoryCard
												category={category}
												currency={currency()}
												isDragging={
													archiveDragAction.activeId()
													=== category.id
												}
												summary={getCategorySummary(
													categorySummaries(),
													category.id
												)}
												onClick={() => (
													handleCategoryClick(category.id)
												)}
												onPointerCancel={isDraggable()
													? archiveDragAction.onPointerCancel
													: undefined}
												onPointerDown={isDraggable()
													? (event) => (
														archiveDragAction.onPointerDown(
															category.id,
															event
														)
													)
													: undefined}
												onPointerMove={isDraggable()
													? archiveDragAction.onPointerMove
													: undefined}
												onPointerUp={isDraggable()
													? archiveDragAction.onPointerUp
													: undefined}
											/>
										);
									}}
								</For>
							</div>
						</Show>
					</Show>
				</Container>
			</main>

			<DragAction.Overlay
				controller={archiveDragAction}
				icon={<Archive size={30} strokeWidth={2.2}/>}
				label='Отправить категорию в архив'
				tone='neutral'
			>
				{(categoryId) => {
					const category = categories().find(
						(item) => item.id === categoryId
					);

					return category ? (
						<DragAction.Preview
							accentColor={category.color}
							description='Категория'
							icon={<span class={css.dragPreviewMark}/>}
							title={category.name}
						/>
					) : null;
				}}
			</DragAction.Overlay>

			<CategoryDialog
				currency={currency()}
				error={dialogError()}
				fieldErrors={dialogFieldErrors()}
				initialValue={categoryDialogInitialValue()}
				isArchived={Boolean(editableCategory()?.archivedAt)}
				loading={isDialogMutationPending()}
				mode={categoryDialogMode()}
				open={isCategoryDialogOpen()}
				restoreLoading={restoreSubmission.pending}
				onOpenChange={handleCategoryDialogOpenChange}
				onRestore={editableCategory()?.archivedAt
					? handleRestoreCategory
					: undefined}
				onSubmit={handleCategorySubmit}
			/>
		</>
	);
}

export function CategoriesPage() {
	const collection = createAsync(() => getCategories({ status: 'all' }));
	const monthlySummary = createAsync(() => getMonthlyExpenseSummary({
		month: getCurrentMonthKey()
	}));

	return (
		<ErrorBoundary
			fallback={(_error, reset) => (
				<CategoriesLoadError
					onRetry={() => {
						void Promise.all([
							revalidate(getCategories.key, true),
							revalidate(getMonthlyExpenseSummary.key, true)
						]).then(reset, reset);
					}}
				/>
			)}
		>
			<CategoriesContent
				collection={collection}
				monthlySummary={monthlySummary}
			/>
		</ErrorBoundary>
	);
}
