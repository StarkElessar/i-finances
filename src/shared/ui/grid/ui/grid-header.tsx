import css from '../grid.module.scss';

import { For } from 'solid-js';

import type { GridSortState, ResolvedGridColumn } from '../types';

import { GridHeaderCell } from './grid-header-cell';

/**
 * Properties of the grid header.
 */
type GridHeaderProps<T> = {
	columns: ResolvedGridColumn<T>[];
	sort?: GridSortState;
	onResizeStart: (index: number, event: MouseEvent) => void;
	onSortChange?: (columnId: string) => void;
};

/**
 * Renders all configured grid column headers.
 */
export function GridHeader<T>(props: GridHeaderProps<T>) {
	return (
		<thead class={css.head}>
			<tr>
				<For each={props.columns}>
					{(column, index) => (
						<GridHeaderCell
							column={column}
							index={index()}
							sort={props.sort}
							onResizeStart={props.onResizeStart}
							onSortChange={props.onSortChange}
						/>
					)}
				</For>
			</tr>
		</thead>
	);
}
