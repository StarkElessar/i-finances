import css from './categories.module.scss';

import { Title } from '@solidjs/meta';
import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js';

import { CategoryCard } from './ui/category-card';
import type { CategoryDialogMode, CategoryDialogValue } from './ui/category-dialog';
import { CategoryDialog } from './ui/category-dialog';

import type { Category } from '~/entities/category';
import {
    CATEGORY_FAMILY_CURRENCY,
    getCategoryBudgetSummary,
    INITIAL_CATEGORIES,
    INITIAL_CATEGORY_OPERATIONS,
    readCategoriesFromStorage,
    writeCategoriesToStorage
} from '~/entities/category';
import { Button, Container } from '~/shared/ui';

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

export function CategoriesPage() {
    const [categories, setCategories] = createSignal<Category[]>(INITIAL_CATEGORIES);
    const [isStorageReady, setIsStorageReady] = createSignal(false);
    const [isCategoryDialogOpen, setIsCategoryDialogOpen] = createSignal(false);
    const [editingCategoryId, setEditingCategoryId] = createSignal<string>();
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
                                        summary={getCategoryBudgetSummary(
                                            category,
                                            INITIAL_CATEGORY_OPERATIONS,
                                            monthDate()
                                        )}
                                        onClick={() => handleOpenEditDialog(category.id)}
                                    />
                                )}
                            </For>
                        </div>
                    </Show>
                </Container>
            </main>

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
