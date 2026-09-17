import css from './operations-list.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';

import { CategoryIcon } from '@/entities/category';
import type { OperationWithBalance } from '@/entities/operation';

import { For, Show } from 'solid-js';

import { OperationGroupRow } from '../operation-group-row/operation-group-row';
import type { OperationsTableProps } from '../operations-table/operations-table';

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

export function OperationsList(props: OperationsTableProps) {
	const handleRowClick = (operation: OperationWithBalance) => {
		props.onOperationSelect(operation);
	};

	return (
		<section aria-label={`Операции счёта «${props.account.name}»`} class={css.root}>
			<Show fallback={<p class={css.empty}>{props.emptyContent}</p>} when={props.groups.length > 0}>
				<For each={props.groups}>
					{(group) => (
						<div class={css.group}>
							<OperationGroupRow
								group={group}
								resolveCategoryColor={props.resolveCategoryColor}
								resolveCategoryIcon={props.resolveCategoryIcon}
							/>
							<ul class={css.items}>
								<For each={group.operations}>
									{(operation) => (
										<li>
											<button
												aria-current={operation.id === props.selectedOperationId}
												class={cn(css.item, operation.id === props.selectedOperationId && css.itemSelected)}
												style={{ '--category-color': props.resolveCategoryColor(operation) }}
												type='button'
												onClick={() => handleRowClick(operation)}
											>
												<span aria-hidden='true' class={css.categoryIcon}>
													<CategoryIcon icon={props.resolveCategoryIcon(operation)} size={16}/>
												</span>
												<span class={css.itemMain}>
													<span class={css.itemTitle}>{operation.title}</span>
													<span class={css.itemAmount}>
														{formatMinorUnitsCurrency(operation.signedAmountMinor, operation.currency)}
													</span>
												</span>
												<span class={css.itemMeta}>
													<span>{formatShortDate(operation.happenedOn)}</span>
													<span>{formatMinorUnitsCurrency(operation.balanceAfterMinor, operation.currency)}</span>
												</span>
											</button>
										</li>
									)}
								</For>
							</ul>
						</div>
					)}
				</For>
			</Show>
		</section>
	);
}
