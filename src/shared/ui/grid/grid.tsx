import css from './grid.module.scss';

import { createMemo, For } from 'solid-js';
import { createStore } from 'solid-js/store';

import { useColumnResize } from './lib/use-column-resize';
import { GridBody } from './ui/grid-body';
import { GridHeader } from './ui/grid-header';
import type { GridColumn, GridProps, ResolvedGridColumn } from './types';

const DEFAULT_COLUMN_WIDTH = 120;
const DEFAULT_MIN_COLUMN_WIDTH = 60;
const DEFAULT_MAX_COLUMN_WIDTH = 800;

/**
 * Resolves optional column dimensions to a valid initial width.
 */
function resolveColumn<T>(column: GridColumn<T>): ResolvedGridColumn<T> {
    const minWidth = column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
    const maxWidth = column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH;
    const width = Math.min(maxWidth, Math.max(minWidth, column.width ?? DEFAULT_COLUMN_WIDTH));

    return { ...column, width };
}

/**
 * Renders a typed data grid with resizable columns and horizontal scrolling.
 */
export function Grid<T>(props: GridProps<T>) {
    const [columns, setColumns] = createStore<ResolvedGridColumn<T>[]>(
        props.columns.map(resolveColumn)
    );

    const tableWidth = createMemo(() => (
        columns.reduce((totalWidth, column) => totalWidth + column.width, 0)
    ));

    const { startResize } = useColumnResize({
        getWidth: (index) => columns[index].width,
        setWidth: (index, width) => setColumns(index, 'width', width),
        getMinWidth: (index) => columns[index].minWidth ?? DEFAULT_MIN_COLUMN_WIDTH,
        getMaxWidth: (index) => columns[index].maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH
    });

    return (
        <div class={css.root}>
            <div class={css.frame}>
                <table
                    class={css.table}
                    style={{ width: `${tableWidth()}px`, 'min-width': '100%' }}
                >
                    <colgroup>
                        <For each={columns}>
                            {(column) => <col style={{ width: `${column.width}px` }}/>}
                        </For>
                    </colgroup>

                    <GridHeader columns={columns} onResizeStart={startResize}/>
                    <GridBody columns={columns} data={props.data}/>
                </table>
            </div>
        </div>
    );
}
