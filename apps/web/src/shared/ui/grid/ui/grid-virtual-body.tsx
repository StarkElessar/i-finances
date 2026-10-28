import css from '../grid.module.scss';

import { For, Show } from 'solid-js';

import type { GridVirtualization } from '../types';

import type { GridBodyProps } from './grid-body';
import { GridRow } from './grid-row';
import { GridSpacerRow } from './grid-spacer-row';

type GridVirtualBodyProps<T> = GridBodyProps<T> & { virtualization: GridVirtualization };

export function GridVirtualBody<T>(props: GridVirtualBodyProps<T>) {
	const paddingTop = () => (props.virtualization.items[0]?.start ?? props.virtualization.scrollMargin)
		- props.virtualization.scrollMargin;
	const paddingBottom = () => props.virtualization.totalSize
		- ((props.virtualization.items.at(-1)?.end ?? props.virtualization.scrollMargin) - props.virtualization.scrollMargin);
	const gapBefore = (index: number) => index > 0
		? props.virtualization.items[index].start - props.virtualization.items[index - 1].end
		: 0;

	return (
		<tbody>
			<Show
				when={props.data.length > 0}
				fallback={(
					<tr class={css.emptyRow}>
						<td colSpan={props.columns.length}>{props.emptyContent ?? 'Нет данных'}</td>
					</tr>
				)}
			>
				<GridSpacerRow columnCount={props.columns.length} size={paddingTop()}/>
				<For each={props.virtualization.items}>
					{(item, index) => (
						<>
							<GridSpacerRow columnCount={props.columns.length} size={gapBefore(index())}/>
							{/* A row at the same virtual index may change after sorting/filtering. Rebuild its cell templates then. */}
							<Show keyed when={props.data[item.index]}>
								{(row) => (
									<GridRow
										columns={props.columns}
										fullWidthRowTemplate={props.fullWidthRowTemplate}
										getRowAriaLabel={props.getRowAriaLabel}
										getRowClass={props.getRowClass}
										isFullWidthRow={props.isFullWidthRow}
										isSelected={props.isRowSelected?.(row) ?? false}
										measureElement={props.virtualization.measureElement}
										row={row}
										rowIndex={item.index}
										rowKey={props.getRowKey?.(row)}
										virtualized
										onRowClick={props.onRowClick}
									/>
								)}
							</Show>
						</>
					)}
				</For>
				<GridSpacerRow columnCount={props.columns.length} size={paddingBottom()}/>
			</Show>
		</tbody>
	);
}
