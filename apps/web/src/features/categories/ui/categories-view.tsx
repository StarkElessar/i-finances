import css from './categories-view.module.scss';

import { ApiHttpError } from '@/shared/api';
import { Button } from '@/shared/ui';

import type {
	CategoryCollection,
	CreateCategoryInput,
	PersistedCategory
} from '@i-finances/contracts';
import { createResource, createSignal, Show } from 'solid-js';

import type { CategoryClient } from '../api';
import { resolveCategoryError } from '../lib';

import { CategoryForm } from './category-form';
import { CategoryList } from './category-list';

export type CategoriesViewProps = {
	client: CategoryClient;
};

export function CategoriesView(props: CategoriesViewProps) {
	const [includeArchived, setIncludeArchived] = createSignal(false);
	const [categories, { refetch }] = createResource<CategoryCollection>(
		() => props.client.list(includeArchived() ? 'all' : 'active')
	);
	const [editingCategory, setEditingCategory] = createSignal<PersistedCategory>();
	const [message, setMessage] = createSignal<string>();
	const [error, setError] = createSignal<string>();
	const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>();
	const [pending, setPending] = createSignal(false);

	const resetFeedback = () => {
		setMessage(undefined);
		setError(undefined);
		setFieldErrors(undefined);
	};

	const handleNew = () => {
		resetFeedback();
		setEditingCategory(undefined);
	};

	const handleEdit = (category: PersistedCategory) => {
		resetFeedback();
		setEditingCategory(category);
	};

	const handleSubmit = async (fields: CreateCategoryInput) => {
		resetFeedback();
		setPending(true);

		try {
			const category = editingCategory();
			const result = category === undefined
				? await props.client.create(fields)
				: await props.client.update({ ...fields, id: category.id, version: category.version });

			if (!result.ok) {
				setError(result.message);
				setFieldErrors(result.fieldErrors);
				return;
			}

			setMessage(category === undefined ? 'Категория создана.' : 'Категория обновлена.');
			setEditingCategory(undefined);
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveCategoryError(caughtError));
		}
		finally {
			setPending(false);
		}
	};

	const handleArchive = async (category: PersistedCategory) => {
		resetFeedback();
		setPending(true);

		try {
			const result = category.archivedAt === null
				? await props.client.archive({ id: category.id, version: category.version })
				: await props.client.restore({ id: category.id, version: category.version });

			if (!result.ok) {
				setError(result.message);
				setFieldErrors(result.fieldErrors);
				return;
			}

			setMessage(category.archivedAt === null ? 'Категория архивирована.' : 'Категория восстановлена.');
			setEditingCategory(undefined);
			await refetch();
		}
		catch (caughtError: unknown) {
			setError(resolveCategoryError(caughtError));
		}
		finally {
			setPending(false);
		}
	};

	return (
		<section aria-labelledby='categories-title' class={css.root}>
			<div class={css.heading}>
				<div class={css.headingContent}>
					<p class='eyebrow'>Справочник категорий</p>
					<h2 class={css.headingTitle} id='categories-title'>Категории</h2>
					<p class={css.headingDescription}>Категории, бюджеты и подсказки для распознавания чеков.</p>
				</div>
				<div class={css.actions}>
					<label class={css.archiveToggle}>
						<input
							checked={includeArchived()}
							onChange={(event) => setIncludeArchived(event.currentTarget.checked)}
							type='checkbox'
						/>
						Показывать архив
					</label>
					<Button variant='secondary' onClick={handleNew}>Новая категория</Button>
				</div>
			</div>

			<Show when={message()}>
				{(currentMessage) => <p class={css.feedbackSuccess} role='status'>{currentMessage()}</p>}
			</Show>
			<Show when={error() && editingCategory() === undefined}>
				{(currentError) => <p class={css.feedbackError} role='alert'>{currentError()}</p>}
			</Show>

			<Show when={!categories.loading} fallback={<p class={css.loading} role='status'>Загрузка категорий…</p>}>
				<Show when={categories()} fallback={<CategoriesError error={categories.error}/>}>
					{(collection) => (
						<CategoryList
							collection={collection()}
							onArchive={handleArchive}
							onEdit={handleEdit}
							pending={pending()}
						/>
					)}
				</Show>
			</Show>

			<CategoryForm
				category={editingCategory()}
				error={error()}
				fieldErrors={fieldErrors()}
				onCancel={handleNew}
				onSubmit={handleSubmit}
				pending={pending()}
			/>
		</section>
	);
}

function CategoriesError(props: { error: unknown }) {
	if (props.error instanceof ApiHttpError && props.error.status === 401) {
		return <p role='alert'>Войдите в приложение, чтобы увидеть категории.</p>;
	}

	return <p role='alert'>Не удалось загрузить категории.</p>;
}
