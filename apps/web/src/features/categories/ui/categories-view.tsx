import type { CategoryCollection } from '@i-finances/contracts';
import { createResource, For, Show } from 'solid-js';

import { ApiHttpError } from '../../../shared/api';
import type { CategoryClient } from '../api';

export type CategoriesViewProps = {
	client: CategoryClient;
};

export function CategoriesView(props: CategoriesViewProps) {
	const [categories] = createResource<CategoryCollection>(() => props.client.list());

	return (
		<section aria-labelledby='categories-title' class='categories-panel'>
			<div class='section-heading'>
				<p class='eyebrow'>Первый web-срез</p>
				<h2 id='categories-title'>Категории</h2>
			</div>

			<Show
				when={!categories.loading}
				fallback={<p role='status'>Загрузка категорий…</p>}
			>
				<Show
					when={categories()}
					fallback={<CategoriesError error={categories.error}/>}
				>
					{(collection) => (
						<Show
							when={collection().items.length > 0}
							fallback={<p>Активных категорий пока нет.</p>}
						>
							<ul class='category-list'>
								<For each={collection().items}>
									{(category) => (
										<li class='category-item'>
											<span
												aria-hidden='true'
												class='category-color'
												style={{ 'background-color': category.color }}
											/>
											<span>{category.name}</span>
											<small>{category.keywords.join(', ') || 'Без ключевых слов'}</small>
										</li>
									)}
								</For>
							</ul>
						</Show>
					)}
				</Show>
			</Show>
		</section>
	);
}

function CategoriesError(props: { error: unknown }) {
	if (props.error instanceof ApiHttpError && props.error.status === 401) {
		return <p role='alert'>Войдите в приложение, чтобы увидеть категории.</p>;
	}

	return <p role='alert'>Не удалось загрузить категории.</p>;
}
