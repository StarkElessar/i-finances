import css from './operations-list.module.scss';

import { cn } from '@/shared/lib';

import { For, Show } from 'solid-js';

import { OperationGroupRow } from '../operation-group-row/operation-group-row';
import type { OperationsTableProps } from '../operations-table/operations-table';
import { useOperationVirtualizer } from '../operations-workspace/lib/use-operation-virtualizer';

import { OperationListRow } from './operation-list-row';

export function OperationsList(props: OperationsTableProps) {
	const { scrollMargin, setScrollElement, virtualizer } = useOperationVirtualizer<HTMLDivElement>({
		density: 'comfortable',
		get highlightOperationId() {
			return props.highlightOperationId;
		},
		get rows() {
			return props.rows;
		},
		get scrollResetKey() {
			return props.scrollResetKey;
		},
		get selectedOperationId() {
			return props.selectedOperationId;
		}
	});
	const paddingTop = () => (virtualizer.getVirtualItems()[0]?.start ?? scrollMargin()) - scrollMargin();
	const paddingBottom = () => virtualizer.getTotalSize()
		- ((virtualizer.getVirtualItems().at(-1)?.end ?? scrollMargin()) - scrollMargin());

	return (
		<section ref={setScrollElement} aria-label={`Операции счёта «${props.account.name}»`} class={css.root}>
			<Show fallback={<p class={css.empty}>{props.emptyContent}</p>} when={props.rows.items.length > 0}>
				<div
					aria-label='Операции по группам'
					role='list'
					style={{ 'padding-block-start': `${paddingTop()}px`, 'padding-block-end': `${paddingBottom()}px` }}
				>
					<For each={virtualizer.getVirtualItems()}>
						{(virtualRow) => (
							<Show keyed when={props.rows.items[virtualRow.index]}>
								{(item) => (
									<div
										ref={(element) => {
											// The ref runs before Solid applies reactive data attributes.
											element.dataset.index = String(virtualRow.index);
											virtualizer.measureElement(element);
										}}
										aria-posinset={virtualRow.index + 1}
										aria-setsize={props.rows.items.length}
										class={cn(item.kind === 'group' && css.groupStart, virtualRow.index === 0 && css.firstGroup)}
										data-index={virtualRow.index}
										data-row-key={item.key}
										role='listitem'
									>
										{item.kind === 'group' ? (
											<div class={css.groupHeading}>
												<OperationGroupRow
													group={item.group}
													resolveCategoryColor={props.resolveCategoryColor}
													resolveCategoryIcon={props.resolveCategoryIcon}
												/>
											</div>
										) : (
											<div class={cn(css.operation, item.isLastInGroup && css.groupEnd)}>
												<OperationListRow
													highlighted={item.operation.id === props.highlightOperationId}
													operation={item.operation}
													resolveCategoryColor={props.resolveCategoryColor}
													resolveCategoryIcon={props.resolveCategoryIcon}
													selected={item.operation.id === props.selectedOperationId}
													onSelect={props.onOperationSelect}
												/>
											</div>
										)}
									</div>
								)}
							</Show>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
