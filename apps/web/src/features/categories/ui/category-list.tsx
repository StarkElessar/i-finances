import css from './category-list.module.scss';

import { Button } from '@/shared/ui';

import type { CategoryCollection, PersistedCategory } from '@i-finances/contracts';
import { For, Show } from 'solid-js';

export type CategoryListProps = {
	collection: CategoryCollection;
	onArchive: (category: PersistedCategory) => Promise<void>;
	onEdit: (category: PersistedCategory) => void;
	pending: boolean;
};

export function CategoryList(props: CategoryListProps) {
	return (
		<Show when={props.collection.items.length > 0} fallback={<p class={css.empty}>Категорий пока нет.</p>}>
			<ul class={css.list}>
				<For each={props.collection.items}>
					{(category) => (
						<li class={css.item} style={{ '--category-color': category.color }}>
							<span aria-hidden='true' class={css.color}/>
							<div class={css.content}>
								<div class={css.titleRow}>
									<strong class={css.title}>{category.name}</strong>
									<small>{category.archivedAt === null ? 'Активна' : 'Архив'}</small>
								</div>
								<div class={css.meta}>
									{category.monthlyBudgetMinor === null
										? 'Без бюджета'
										: `Бюджет ${(category.monthlyBudgetMinor / 100).toFixed(2)} ${props.collection.baseCurrency}`}
								</div>
								<Show when={category.description.length > 0}>
									<p class={css.description}>{category.description}</p>
								</Show>
								<Show when={category.keywords.length > 0}>
									<ul class={css.keywords}>
										<For each={category.keywords}>{(keyword) => <li class={css.keyword}>{keyword}</li>}</For>
									</ul>
								</Show>
							</div>
							<div class={css.actions}>
								<Button
									disabled={props.pending}
									size='sm'
									variant='secondary'
									onClick={() => props.onEdit(category)}
								>
									Изменить
								</Button>
								<Button
									disabled={props.pending}
									size='sm'
									variant='ghost'
									onClick={() => props.onArchive(category)}
								>
									{category.archivedAt === null ? 'В архив' : 'Восстановить'}
								</Button>
							</div>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
