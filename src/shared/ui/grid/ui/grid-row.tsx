import css from '../grid.module.scss';

import { cn } from '~/shared/lib';

import type { JSX } from 'solid-js';
import { For, Show } from 'solid-js';

import type { GridFullWidthRowTemplateContext, ResolvedGridColumn } from '../types';

import { GridCell } from './grid-cell';

/**
 * Properties of a rendered grid row.
 */
type GridRowProps<T> = {
	columns: readonly ResolvedGridColumn<T>[];
	fullWidthRowTemplate?: (context: GridFullWidthRowTemplateContext<T>) => JSX.Element;
	getRowAriaLabel?: (row: T) => string;
	getRowClass?: (row: T) => string | undefined;
	isFullWidthRow?: (row: T) => boolean;
	isSelected: boolean;
	row: T;
	rowIndex: number;
	rowKey?: string;
	onRowClick?: (row: T) => void;
};

/**
 * Renders one data row using the configured column accessors.
 */
export function GridRow<T>(props: GridRowProps<T>) {
	const isFullWidth = () => props.isFullWidthRow?.(props.row) ?? false;
	const isInteractive = () => Boolean(props.onRowClick) && !isFullWidth();

	const handleClick = () => {
		if (!props.isSelected) {
			props.onRowClick?.(props.row);
		}
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		if (props.isSelected || (event.key !== 'Enter' && event.key !== ' ')) {
			return;
		}

		event.preventDefault();
		props.onRowClick?.(props.row);
	};

	return (
		<tr
			aria-label={isInteractive() ? props.getRowAriaLabel?.(props.row) : undefined}
			aria-selected={isInteractive() ? props.isSelected : undefined}
			class={cn(
				props.getRowClass?.(props.row),
				isFullWidth() && css.fullWidthRow,
				isInteractive() && css.interactiveRow,
				props.isSelected && css.selectedRow
			)}
			data-row-key={props.rowKey}
			tabIndex={isInteractive() && !props.isSelected ? 0 : undefined}
			onClick={isInteractive() ? handleClick : undefined}
			onKeyDown={isInteractive() ? handleKeyDown : undefined}
		>
			<Show
				when={isFullWidth()}
				fallback={(
					<For each={props.columns}>
						{(column) => (
							<GridCell
								column={column}
								dataItem={props.row}
								rowIndex={props.rowIndex}
							/>
						)}
					</For>
				)}
			>
				<td colSpan={props.columns.length}>
					{props.fullWidthRowTemplate?.({
						columnCount: props.columns.length,
						dataItem: props.row,
						rowIndex: props.rowIndex
					})}
				</td>
			</Show>
		</tr>
	);
}
