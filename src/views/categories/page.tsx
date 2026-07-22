import css from './categories.module.scss';

import { Title } from '@solidjs/meta';
import type { JSX } from 'solid-js';
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';

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
import { INITIAL_OPERATIONS } from '~/entities/operation';
import { cn } from '~/shared/lib';
import { Button, Container } from '~/shared/ui';

const DRAG_START_THRESHOLD_PX = 8;

type CategoryDragSession = {
    categoryId: string;
    clientX: number;
    clientY: number;
    hasMoved: boolean;
    pointerId: number;
    startX: number;
    startY: number;
};

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

function getDragPreviewStyle(category: Category): JSX.CSSProperties {
    return {
        '--category-color': category.color
    };
}

function getDragPreviewTransform(clientX: number, clientY: number): string {
    return `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%) rotate(-1deg)`;
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

function isPointInsideElement(x: number, y: number, element: HTMLElement | undefined): boolean {
    if (element === undefined) {
        return false;
    }

    const rect = element.getBoundingClientRect();

    return x >= rect.left
        && x <= rect.right
        && y >= rect.top
        && y <= rect.bottom;
}

function releasePointerCapture(element: HTMLElement, pointerId: number): void {
    if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
    }
}

export function CategoriesPage() {
    let deleteZoneElement: HTMLDivElement | undefined;
    let dragFrameId: number | undefined;
    let dragPreviewElement: HTMLDivElement | undefined;
    let dragSession: CategoryDragSession | undefined;
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [isStorageReady, setIsStorageReady] = createSignal(false);
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = createSignal(false);
    const [editingCategoryId, setEditingCategoryId] = createSignal<string>();
    const [draggedCategoryId, setDraggedCategoryId] = createSignal<string>();
    const [isDragOverDeleteZone, setIsDragOverDeleteZone] = createSignal(false);
    const [suppressedClickCategoryId, setSuppressedClickCategoryId] = createSignal<string>();
    const [monthDate] = createSignal(new Date());

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
            getCategoryBudgetSummary(category, INITIAL_OPERATIONS, currentMonth)
        ]));
    });

    const draggedCategory = createMemo(() => {
        const categoryId = draggedCategoryId();

        if (categoryId === undefined) {
            return undefined;
        }

        return categories().find((category) => category.id === categoryId);
    });

    onMount(() => {
        const storedCategories = readCategoriesFromStorage(window.localStorage);

        if (storedCategories) {
            setCategories(storedCategories);
        }

        setIsStorageReady(true);
    });

    createEffect(() => {
        if (!isStorageReady()) {
            return;
        }

        writeCategoriesToStorage(window.localStorage, categories());
    });

    onCleanup(() => {
        if (dragFrameId !== undefined) {
            window.cancelAnimationFrame(dragFrameId);
        }
    });

    const updateDragVisuals = () => {
        dragFrameId = undefined;

        if (dragSession === undefined || !dragSession.hasMoved) {
            return;
        }

        const isOverDeleteZone = isPointInsideElement(
            dragSession.clientX,
            dragSession.clientY,
            deleteZoneElement
        );

        if (dragPreviewElement !== undefined) {
            dragPreviewElement.style.transform = getDragPreviewTransform(
                dragSession.clientX,
                dragSession.clientY
            );
        }

        setIsDragOverDeleteZone(isOverDeleteZone);
    };

    const scheduleDragVisualUpdate = () => {
        if (dragFrameId !== undefined) {
            return;
        }

        dragFrameId = window.requestAnimationFrame(updateDragVisuals);
    };

    const resetDragSession = () => {
        if (dragFrameId !== undefined) {
            window.cancelAnimationFrame(dragFrameId);
            dragFrameId = undefined;
        }

        dragSession = undefined;
        setDraggedCategoryId(undefined);
        setIsDragOverDeleteZone(false);
        deleteZoneElement = undefined;
        dragPreviewElement = undefined;
    };

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

    const handleCategoryClick = (categoryId: string) => {
        if (suppressedClickCategoryId() === categoryId) {
            setSuppressedClickCategoryId(undefined);
            return;
        }

        handleOpenEditDialog(categoryId);
    };

    const handleCategoryDialogOpenChange = (open: boolean) => {
        setIsCategoryDialogOpen(open);
    };

    const handleCategoryPointerDown = (
        categoryId: string,
        event: PointerEvent & { currentTarget: HTMLButtonElement }
    ) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        setSuppressedClickCategoryId(undefined);
        dragSession = {
            categoryId,
            clientX: event.clientX,
            clientY: event.clientY,
            hasMoved: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY
        };
    };

    const handleCategoryPointerMove = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const session = dragSession;

        if (session === undefined || session.pointerId !== event.pointerId) {
            return;
        }

        session.clientX = event.clientX;
        session.clientY = event.clientY;

        if (!session.hasMoved) {
            const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);

            if (distance < DRAG_START_THRESHOLD_PX) {
                return;
            }

            session.hasMoved = true;
            setDraggedCategoryId(session.categoryId);
        }

        event.preventDefault();
        scheduleDragVisualUpdate();
    };

    const handleCategoryPointerUp = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const session = dragSession;

        if (session === undefined || session.pointerId !== event.pointerId) {
            return;
        }

        releasePointerCapture(event.currentTarget, event.pointerId);

        if (session.hasMoved) {
            event.preventDefault();
            setSuppressedClickCategoryId(session.categoryId);
            window.setTimeout(() => setSuppressedClickCategoryId(undefined), 0);
        }

        const shouldDelete = session.hasMoved
            && isPointInsideElement(event.clientX, event.clientY, deleteZoneElement);
        const categoryId = session.categoryId;

        resetDragSession();

        if (shouldDelete) {
            handleDeleteCategory(categoryId);
        }
    };

    const handleCategoryPointerCancel = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const session = dragSession;

        if (session === undefined || session.pointerId !== event.pointerId) {
            return;
        }

        releasePointerCapture(event.currentTarget, event.pointerId);
        resetDragSession();
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
                <Container class={css.page} useMaxSize>
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
                                        isDragging={draggedCategoryId() === category.id}
                                        summary={getCategorySummary(categorySummaries(), category.id)}
                                        onClick={() => handleCategoryClick(category.id)}
                                        onPointerCancel={(event) => handleCategoryPointerCancel(event)}
                                        onPointerDown={(event) => handleCategoryPointerDown(category.id, event)}
                                        onPointerMove={(event) => handleCategoryPointerMove(event)}
                                        onPointerUp={(event) => handleCategoryPointerUp(event)}
                                    />
                                )}
                            </For>
                        </div>
                    </Show>
                </Container>
            </main>

            <Show when={draggedCategoryId()}>
                <div
                    ref={(element) => {
                        deleteZoneElement = element;
                    }}
                    aria-hidden='true'
                    class={cn(
                        css.deleteZone,
                        css.deleteZoneVisible,
                        isDragOverDeleteZone() && css.deleteZoneActive
                    )}
                >
                    <span class={css.deleteZoneIcon}>
                        <svg width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2'>
                            <path d='M4 7h16'/>
                            <path d='M9 7V5.8C9 4.8 9.8 4 10.8 4h2.4c1 0 1.8.8 1.8 1.8V7'/>
                            <path d='M18 7l-.8 11.1c-.1 1.1-1 1.9-2.1 1.9H8.9c-1.1 0-2-.8-2.1-1.9L6 7'/>
                            <path d='M10 11v5M14 11v5'/>
                        </svg>
                    </span>
                    <span class={css.deleteZoneText}>Удалить категорию</span>
                </div>
            </Show>

            <Show when={draggedCategory()}>
                {(category) => (
                    <div
                        ref={(element) => {
                            dragPreviewElement = element;

                            if (dragSession !== undefined) {
                                element.style.transform = getDragPreviewTransform(
                                    dragSession.clientX,
                                    dragSession.clientY
                                );
                            }
                        }}
                        aria-hidden='true'
                        class={cn(css.dragPreview, isDragOverDeleteZone() && css.dragPreviewDanger)}
                        style={getDragPreviewStyle(category())}
                    >
                        <span class={css.dragPreviewIcon}>
                            <span/>
                        </span>
                        <span class={css.dragPreviewContent}>
                            <span class={css.dragPreviewTitle}>{category().name}</span>
                            <span>Категория</span>
                        </span>
                    </div>
                )}
            </Show>

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
