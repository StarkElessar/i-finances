import { For } from 'solid-js';

import type { ResolvedGridColumn } from '../types';

import { GridRow } from './grid-row';

/**
 * Properties of the grid body.
 */
type GridBodyProps<T> = {
    columns: readonly ResolvedGridColumn<T>[];
    data: readonly T[];
};

/**
 * Renders all rows supplied to the grid.
 */
export function GridBody<T>(props: GridBodyProps<T>) {
    return (
        <tbody>
            <For each={props.data}>
                {(row, index) => (
                    <GridRow
                        columns={props.columns}
                        row={row}
                        rowIndex={index()}
                    />
                )}
            </For>
        </tbody>
    );
}
