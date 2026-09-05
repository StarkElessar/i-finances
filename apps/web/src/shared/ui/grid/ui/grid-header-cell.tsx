import css from '../grid.module.scss';

import { Show } from 'solid-js';

import type { GridSortState, ResolvedGridColumn } from '../types';

/**
 * Properties of a resizable grid header cell.
 */
type GridHeaderCellProps<T> = {
	column: ResolvedGridColumn<T>;
	index: number;
	sort?: GridSortState;
	onResizeStart: (index: number, event: MouseEvent) => void;
	onSortChange?: (columnId: string) => void;
};

/**
 * Renders a column title and its resize handle.
 */
export function GridHeaderCell<T>(props: GridHeaderCellProps<T>) {
	const isActiveSort = () => props.sort?.columnId === props.column.id;
	const ariaSort = () => {
		if (!isActiveSort()) {
			return undefined;
		}

		return props.sort?.direction === 'asc' ? 'ascending' as const : 'descending' as const;
	};

	return (
		<th
			aria-sort={ariaSort()}
			scope='col'
			style={{ width: `${props.column.width}px` }}
		>
			<Show
				fallback={<span class={css.headerLabel}>{props.column.header}</span>}
				when={props.column.sortable}
			>
				<Show
					fallback={(
						<button
							aria-label={`Сортировать по колонке «${props.column.header}»`}
							class={css.sortButton}
							type='button'
							onClick={() => props.onSortChange?.(props.column.id)}
						>
							{props.column.header}
						</button>
					)}
					when={isActiveSort()}
				>
					<span class={css.activeSort}>
						{props.column.header}
						<span
							aria-hidden='true'
							class={css.sortIndicator}
							data-direction={props.sort?.direction}
						/>
					</span>
				</Show>
			</Show>
			<div
				role='separator'
				aria-orientation='vertical'
				class={css.resizer}
				onMouseDown={(event) => props.onResizeStart(props.index, event)}
			/>
		</th>
	);
}
