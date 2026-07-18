import { For } from 'solid-js';

import type { ResolvedGridColumn } from '../types';

import { GridCell } from './grid-cell';

/**
 * Properties of a rendered grid row.
 */
type GridRowProps<T> = {
    columns: readonly ResolvedGridColumn<T>[];
    row: T;
    rowIndex: number;
};

/**
 * Renders one data row using the configured column accessors.
 */
export function GridRow<T>(props: GridRowProps<T>) {
    return (
        <tr>
            <For each={props.columns}>
                {(column) => (
                    <GridCell
                        column={column}
                        dataItem={props.row}
                        rowIndex={props.rowIndex}
                    />
                )}
            </For>
        </tr>
    );
}
