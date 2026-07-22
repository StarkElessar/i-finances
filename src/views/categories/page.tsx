import css from './categories.module.scss';

import { Title } from '@solidjs/meta';
import type { JSX } from 'solid-js';
import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';

import { CategoryCard } from './ui/category-card';
import type { CategoryDialogMode, CategoryDialogValue } from './ui/category-dialog';
import { CategoryDialog } from './ui/category-dialog';

import type { Category } from '~/entities/category';
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

type CategoryDragState = {
    categoryId: string;
    clientX: number;
    clientY: number;
    hasMoved: boolean;
    isOverDeleteZone: boolean;
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

function getDragPreviewStyle(state: CategoryDragState, category: Category): JSX.CSSProperties {
    return {
        '--category-color': category.color,
        '--drag-x': `${state.clientX}px`,
        '--drag-y': `${state.clientY}px`
    };
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
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [isStorageReady, setIsStorageReady] = createSignal(false);
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = createSignal(false);
    const [editingCategoryId, setEditingCategoryId] = createSignal<string>();
    const [dragState, setDragState] = createSignal<CategoryDragState>();
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

    const activeDragState = createMemo(() => {
        const state = dragState();

        if (state === undefined || !state.hasMoved) {
            return undefined;
        }

        return state;
    });

    const draggedCategory = createMemo(() => {
        const state = dragState();

        if (state === undefined) {
            return undefined;
        }

        return categories().find((category) => category.id === state.categoryId);
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
        setDragState({
            categoryId,
            clientX: event.clientX,
            clientY: event.clientY,
            hasMoved: false,
            isOverDeleteZone: false,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY
        });
    };

    const handleCategoryPointerMove = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const state = dragState();

        if (state === undefined || state.pointerId !== event.pointerId) {
            return;
        }

        const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
        const hasMoved = state.hasMoved || distance >= DRAG_START_THRESHOLD_PX;

        if (hasMoved) {
            event.preventDefault();
        }

        setDragState({
            ...state,
            clientX: event.clientX,
            clientY: event.clientY,
            hasMoved,
            isOverDeleteZone: hasMoved && isPointInsideElement(event.clientX, event.clientY, deleteZoneElement)
        });
    };

    const handleCategoryPointerUp = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const state = dragState();

        if (state === undefined || state.pointerId !== event.pointerId) {
            return;
        }

        releasePointerCapture(event.currentTarget, event.pointerId);

        if (state.hasMoved) {
            event.preventDefault();
            setSuppressedClickCategoryId(state.categoryId);
            window.setTimeout(() => setSuppressedClickCategoryId(undefined), 0);
        }

        const shouldDelete = state.hasMoved && isPointInsideElement(event.clientX, event.clientY, deleteZoneElement);

        setDragState(undefined);

        if (shouldDelete) {
            handleDeleteCategory(state.categoryId);
        }
    };

    const handleCategoryPointerCancel = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
        const state = dragState();

        if (state === undefined || state.pointerId !== event.pointerId) {
            return;
        }

        releasePointerCapture(event.currentTarget, event.pointerId);
        setDragState(undefined);
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
                                        isDragging={dragState()?.categoryId === category.id}
                                        summary={getCategoryBudgetSummary(
                                            category,
                                            INITIAL_OPERATIONS,
                                            monthDate()
                                        )}
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

            <Show when={dragState()}>
                <div
                    ref={(element) => {
                        deleteZoneElement = element;
                    }}
                    aria-hidden='true'
                    class={cn(
                        css.deleteZone,
                        dragState()?.hasMoved && css.deleteZoneVisible,
                        dragState()?.isOverDeleteZone && css.deleteZoneActive
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

            <Show keyed when={activeDragState()}>
                {(state) => (
                    <Show keyed when={draggedCategory()}>
                        {(category) => (
                            <div
                                aria-hidden='true'
                                class={cn(css.dragPreview, state.isOverDeleteZone && css.dragPreviewDanger)}
                                style={getDragPreviewStyle(state, category)}
                            >
                                <span class={css.dragPreviewIcon}>
                                    <span/>
                                </span>
                                <span class={css.dragPreviewContent}>
                                    <span class={css.dragPreviewTitle}>{category.name}</span>
                                    <span>Категория</span>
                                </span>
                            </div>
                        )}
                    </Show>
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
