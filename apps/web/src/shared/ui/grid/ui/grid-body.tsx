import css from '../grid.module.scss';

import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';

import type { GridFullWidthRowTemplateContext, GridVirtualization, ResolvedGridColumn } from '../types';

import { GridRow } from './grid-row';
import { GridVirtualBody } from './grid-virtual-body';

/**
 * Properties of the grid body.
 */
export type GridBodyProps<T> = {
	columns: readonly ResolvedGridColumn<T>[];
	data: readonly T[];
	emptyContent?: JSX.Element;
	fullWidthRowTemplate?: (context: GridFullWidthRowTemplateContext<T>) => JSX.Element;
	getRowAriaLabel?: (row: T) => string;
	getRowClass?: (row: T) => string | undefined;
	getRowKey?: (row: T) => string;
	isFullWidthRow?: (row: T) => boolean;
	isRowSelected?: (row: T) => boolean;
	virtualization?: GridVirtualization;
	onRowClick?: (row: T) => void;
};

/**
 * Keeps ordinary grids keyed by data rows; virtual grids render a measured window.
 */
export function GridBody<T>(props: GridBodyProps<T>) {
	return (
		<Show
			when={props.virtualization}
			fallback={(
				<tbody>
					<Show
						fallback={(
							<tr class={css.emptyRow}>
								<td colSpan={props.columns.length}>
									{props.emptyContent ?? 'Нет данных'}
								</td>
							</tr>
						)}
						when={props.data.length > 0}
					>
						<For each={props.data}>
							{(row, index) => (
								<GridRow
									columns={props.columns}
									fullWidthRowTemplate={props.fullWidthRowTemplate}
									getRowAriaLabel={props.getRowAriaLabel}
									getRowClass={props.getRowClass}
									isFullWidthRow={props.isFullWidthRow}
									isSelected={props.isRowSelected?.(row) ?? false}
									row={row}
									rowIndex={index()}
									rowKey={props.getRowKey?.(row)}
									onRowClick={props.onRowClick}
								/>
							)}
						</For>
					</Show>
				</tbody>
			)}
		>
			{(virtualization) => <GridVirtualBody {...props} virtualization={virtualization()}/>}
		</Show>
	);
}
