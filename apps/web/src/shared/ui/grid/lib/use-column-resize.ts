import { createSignal, onCleanup } from 'solid-js';

/**
 * Active drag state for a column resize operation.
 */
type ResizeState = {
	columnIndex: number;
	startX: number;
	startWidth: number;
};

/**
 * Dependencies required to read and update column widths.
 */
type ColumnResizeOptions = {
	getWidth: (index: number) => number;
	setWidth: (index: number, width: number) => void;
	getMinWidth: (index: number) => number;
	getMaxWidth: (index: number) => number;
};

/**
 * Connects a header resize handle to reactive column widths.
 */
export function useColumnResize(options: ColumnResizeOptions) {
	const [resizing, setResizing] = createSignal<ResizeState | null>(null);

	/**
	 * Keeps a width inside the selected column constraints.
	 */
	const clamp = (width: number, index: number) => (
		Math.min(options.getMaxWidth(index), Math.max(options.getMinWidth(index), width))
	);

	/**
	 * Applies the current pointer delta to the active column.
	 */
	const onMouseMove = (event: MouseEvent) => {
		const state = resizing();

		if (state) {
			const delta = event.clientX - state.startX;
			options.setWidth(state.columnIndex, clamp(state.startWidth + delta, state.columnIndex));
		}
	};

	/**
	 * Finishes resizing and restores global document styles.
	 */
	const onMouseUp = () => {
		setResizing(null);
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	};

	onCleanup(() => {
		if (typeof document !== 'undefined') {
			onMouseUp();
		}
	});

	/**
	 * Starts resizing the selected column.
	 */
	const startResize = (columnIndex: number, event: MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();

		setResizing({
			columnIndex,
			startX: event.clientX,
			startWidth: options.getWidth(columnIndex)
		});

		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
	};

	return {
		startResize,
		isResizing: () => resizing() !== null
	};
}
