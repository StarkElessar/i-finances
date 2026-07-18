import css from '../grid.module.scss';

import type { ResolvedGridColumn } from '../types';

/**
 * Properties of a resizable grid header cell.
 */
type GridHeaderCellProps<T> = {
    column: ResolvedGridColumn<T>;
    index: number;
    onResizeStart: (index: number, event: MouseEvent) => void;
};

/**
 * Renders a column title and its resize handle.
 */
export function GridHeaderCell<T>(props: GridHeaderCellProps<T>) {
    return (
        <th
            scope='col'
            style={{ width: `${props.column.width}px` }}
        >
            <span>{props.column.header}</span>
            <div
                role='separator'
                aria-orientation='vertical'
                class={css.resizer}
                onMouseDown={(event) => props.onResizeStart(props.index, event)}
            />
        </th>
    );
}
