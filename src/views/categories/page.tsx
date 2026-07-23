import css from './categories.module.scss';

import { Title } from '@solidjs/meta';
import { Trash2 } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';

import { CategoryCard } from './ui/category-card';
import type { CategoryDialogMode, CategoryDialogValue } from './ui/category-dialog';
import { CategoryDialog } from './ui/category-dialog';

import type { Category, CategoryBudgetSummary } from '~/entities/category';
import {
    CATEGORY_FAMILY_CURRENCY,
    getCategoryBudgetSummary,
    INITIAL_CATEGORIES,
    readCategoriesFromStorage,
    writeCategoriesToStorage
} from '~/entities/category';
import type { Operation } from '~/entities/operation';
import {
    INITIAL_OPERATIONS,
    readOperationsFromStorage
} from '~/entities/operation';
import { Button, Container } from '~/shared/ui';
import { createDragAction, DragAction } from '~/shared/ui/drag-action';

function createCategoryId(): string {
    return globalThis.crypto.randomUUID();
}

function createCategoryFromDialogValue(value: CategoryDialogValue): Category {
    const now = new Date().toISOString();

    return {
        ...value,
        createdAt: now,
        id: createCategoryId(),
        updatedAt: now
    };
}

function toDialogValue(category: Category): CategoryDialogValue {
    return {
        color: category.color,
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

export function CategoriesPage() {
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [isStorageReady, setIsStorageReady] = createSignal(false);
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = createSignal(false);
    const [editingCategoryId, setEditingCategoryId] = createSignal<string>();
    const [monthDate] = createSignal(new Date());
    const [operations, setOperations] = createSignal<Operation[]>(INITIAL_OPERATIONS);

    const editableCategory = createMemo(() => {
        const categoryId = editingCategoryId();

        if (!categoryId) {
            return undefined;
        }

        return categories().find((category) => category.id === categoryId);
    });

    const categoryDialogMode = createMemo<CategoryDialogMode>(() => {
        return editableCategory() ? 'edit' : 'create';
    });

    const categoryDialogInitialValue = createMemo(() => {
        const category = editableCategory();

        return category ? toDialogValue(category) : undefined;
    });

    const categorySummaries = createMemo(() => {
        const currentMonth = monthDate();

        return new Map(categories().map((category) => [
            category.id,
            getCategoryBudgetSummary(category, operations(), currentMonth)
        ]));
    });

    onMount(() => {
        const storedCategories = readCategoriesFromStorage(window.localStorage);

        if (storedCategories) {
            setCategories(storedCategories);
        }

        const storedOperations = readOperationsFromStorage(window.localStorage);

        if (storedOperations) {
            setOperations(storedOperations);
        }

        setIsStorageReady(true);
    });

    createEffect(() => {
        if (!isStorageReady()) {
            return;
        }

        writeCategoriesToStorage(window.localStorage, categories());
    });

    const handleOpenCreateDialog = () => {
        setEditingCategoryId(undefined);
        setIsCategoryDialogOpen(true);
    };

    const handleOpenEditDialog = (categoryId: string) => {
        setEditingCategoryId(categoryId);
        setIsCategoryDialogOpen(true);
    };

    const handleDeleteCategory = (categoryId: string) => {
        setCategories((currentCategories) => {
            return currentCategories.filter((category) => category.id !== categoryId);
        });

        if (editingCategoryId() === categoryId) {
            setEditingCategoryId(undefined);
            setIsCategoryDialogOpen(false);
        }
    };

    const deleteDragAction = createDragAction({
        onDrop: handleDeleteCategory
    });

    const handleCategoryClick = (categoryId: string) => {
        if (deleteDragAction.consumeClick(categoryId)) {
            return;
        }

        handleOpenEditDialog(categoryId);
    };

    const handleCategoryDialogOpenChange = (open: boolean) => {
        setIsCategoryDialogOpen(open);
    };

    const handleCategorySubmit = (value: CategoryDialogValue) => {
        const editingId = editingCategoryId();

        if (!editingId) {
            setCategories((currentCategories) => [
                ...currentCategories,
                createCategoryFromDialogValue(value)
            ]);
            setIsCategoryDialogOpen(false);
            return;
        }

        setCategories((currentCategories) => {
            const now = new Date().toISOString();

            return currentCategories.map((category) => {
                if (category.id !== editingId) {
                    return category;
                }

                return {
                    ...category,
                    ...value,
                    updatedAt: now
                };
            });
        });
        setIsCategoryDialogOpen(false);
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
                            iconOnly
                            size='lg'
                            type='button'
                            onClick={handleOpenCreateDialog}
                        >
                            <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'>
                                <path d='M12 5v14M5 12h14'/>
                            </svg>
                        </Button>
                    </header>

                    <Show
                        fallback={(
                            <div class={css.emptyState}>
                                <div>Категорий пока нет</div>
                                <Button type='button' onClick={handleOpenCreateDialog}>Добавить категорию</Button>
                            </div>
                        )}
                        when={categories().length > 0}
                    >
                        <div class={css.grid}>
                            <For each={categories()}>
                                {(category) => (
                                    <CategoryCard
                                        category={category}
                                        currency={CATEGORY_FAMILY_CURRENCY}
                                        isDragging={deleteDragAction.activeId() === category.id}
                                        summary={getCategorySummary(categorySummaries(), category.id)}
                                        onClick={() => handleCategoryClick(category.id)}
                                        onPointerCancel={deleteDragAction.onPointerCancel}
                                        onPointerDown={(event) => deleteDragAction.onPointerDown(category.id, event)}
                                        onPointerMove={deleteDragAction.onPointerMove}
                                        onPointerUp={deleteDragAction.onPointerUp}
                                    />
                                )}
                            </For>
                        </div>
                    </Show>
                </Container>
            </main>

            <DragAction.Overlay
                controller={deleteDragAction}
                icon={<Trash2 size={30} strokeWidth={2.2}/>}
                label='Удалить категорию'
                tone='danger'
            >
                {(categoryId) => {
                    const category = categories().find((item) => item.id === categoryId);

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
                currency={CATEGORY_FAMILY_CURRENCY}
                initialValue={categoryDialogInitialValue()}
                mode={categoryDialogMode()}
                open={isCategoryDialogOpen()}
                onOpenChange={handleCategoryDialogOpenChange}
                onSubmit={handleCategorySubmit}
            />
        </>
    );
}
