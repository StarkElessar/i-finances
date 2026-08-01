import { Show } from 'solid-js';

import type { GridCellValue, ResolvedGridColumn } from '../types';

/**
 * Properties required to render one body cell.
 */
type GridCellProps<T> = {
	column: ResolvedGridColumn<T>;
	dataItem: T;
	rowIndex: number;
};

/**
 * Converts a primitive cell value to display text.
 */
function formatCellValue(value: GridCellValue): string {
	return value == null ? '✕' : String(value);
}

/**
 * Renders a custom client template or the default primitive value.
 */
export function GridCell<T>(props: GridCellProps<T>) {
	const value = () => props.column.accessor(props.dataItem);

	return (
		<td>
			<Show
				when={props.column.clientTemplate}
				fallback={formatCellValue(value())}
			>
				{(clientTemplate) => clientTemplate()({
					dataItem: props.dataItem,
					value: value(),
					rowIndex: props.rowIndex
				})}
			</Show>
		</td>
	);
}
