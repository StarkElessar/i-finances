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

export type GridFullWidthRowTemplateContext<T> = {
	columnCount: number;
	dataItem: T;
	rowIndex: number;
};

export type GridSortDirection = 'asc' | 'desc';

export type GridSortState = {
	columnId: string;
	direction: GridSortDirection;
};

/**
 * Declarative description of a grid column for a row of type `T`.
 */
export type GridColumn<T> = {
	id: string;
	header: string;
	accessor: (row: T) => GridCellValue;
	clientTemplate?: (context: GridCellTemplateContext<T>) => JSX.Element;
	sortable?: boolean;
	width?: number;
	minWidth?: number;
	maxWidth?: number;
};

/**
 * Public properties of the declarative grid.
 */
export type GridProps<T> = {
	'aria-label'?: string;
	class?: string;
	columns: readonly GridColumn<T>[];
	data: readonly T[];
	emptyContent?: JSX.Element;
	fullWidthRowTemplate?: (context: GridFullWidthRowTemplateContext<T>) => JSX.Element;
	getRowAriaLabel?: (row: T) => string;
	getRowClass?: (row: T) => string | undefined;
	getRowKey?: (row: T) => string;
	isFullWidthRow?: (row: T) => boolean;
	isRowSelected?: (row: T) => boolean;
	sort?: GridSortState;
	onRowClick?: (row: T) => void;
	onSortChange?: (columnId: string) => void;
};

/**
 * Internal column model with a resolved pixel width.
 */
export type ResolvedGridColumn<T> = GridColumn<T> & {
	width: number;
};
