import type { JSX } from 'solid-js';

/**
 * Primitive value that the grid can render without a custom cell template.
 */
export type GridCellValue = string | number | boolean | null | undefined;

/**
 * Values available to a custom body cell template.
 */
export type GridCellTemplateContext<T> = {
    dataItem: T;
    value: GridCellValue;
    rowIndex: number;
};

/**
 * Declarative description of a grid column for a row of type `T`.
 */
export type GridColumn<T> = {
    id: string;
    header: string;
    accessor: (row: T) => GridCellValue;
    clientTemplate?: (context: GridCellTemplateContext<T>) => JSX.Element;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
};

/**
 * Public properties of the declarative grid.
 */
export type GridProps<T> = {
    columns: readonly GridColumn<T>[];
    data: readonly T[];
};

/**
 * Internal column model with a resolved pixel width.
 */
export type ResolvedGridColumn<T> = GridColumn<T> & {
    width: number;
};
