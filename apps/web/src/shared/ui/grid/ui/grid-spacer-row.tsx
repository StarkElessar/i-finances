import css from '../grid.module.scss';

import { Show } from 'solid-js';

type GridSpacerRowProps = {
	columnCount: number;
	size: number;
};

/** Native table sections ignore padding; a hidden cell provides the equivalent scroll space. */
export function GridSpacerRow(props: GridSpacerRowProps) {
	return (
		<Show when={props.size > 0}>
			<tr aria-hidden='true' class={css.spacerRow}>
				<td colSpan={props.columnCount} style={{ 'padding-block-start': `${props.size}px` }}/>
			</tr>
		</Show>
	);
}
