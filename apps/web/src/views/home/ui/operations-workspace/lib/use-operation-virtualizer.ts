import type { Range } from '@tanstack/solid-virtual';
import { createVirtualizer, defaultRangeExtractor } from '@tanstack/solid-virtual';
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';

import type { OperationVirtualItems } from '../../../model/operation-virtual-items';
import type { OperationVirtualSizes } from '../../../model/operation-virtual-size';
import { estimateOperationItemSize, operationTokenPixels } from '../../../model/operation-virtual-size';

type OperationVirtualizerOptions = {
	density: 'compact' | 'comfortable';
	highlightOperationId?: string;
	rows: OperationVirtualItems;
	scrollResetKey: string;
	selectedOperationId?: string;
};

/** Both renderers use their existing scroll owner, never a nested viewport. */
export function useOperationVirtualizer<TItem extends HTMLElement>(options: OperationVirtualizerOptions) {
	let suppressedRevealId: string | undefined;
	const [scrollElement, setScrollElement] = createSignal<HTMLElement>();
	const [sizes, setSizes] = createSignal<OperationVirtualSizes>();
	const [scrollMargin, setScrollMargin] = createSignal(0);
	const getItemKey = createMemo(() => {
		const items = options.rows.items;

		return (index: number) => items[index].key;
	});
	const rangeExtractor = createMemo(() => {
		const items = options.rows.items;
		const isTable = options.density === 'compact';

		return (range: Range) => {
			const indices = defaultRangeExtractor(range);
			const groupIndex = items[range.startIndex].groupIndex;

			// Keep the current sticky day heading mounted even in a very large day.
			return isTable && groupIndex < indices[0] ? [groupIndex, ...indices] : indices;
		};
	});
	const targetOperationId = createMemo(() => {
		const highlightId = options.highlightOperationId;

		return highlightId && options.rows.operationIndexById.has(highlightId) ? highlightId : options.selectedOperationId;
	});
	const virtualizer = createVirtualizer<HTMLElement, TItem>({
		get count() {
			return options.rows.items.length;
		},
		get enabled() {
			return sizes() !== undefined;
		},
		getScrollElement: () => scrollElement() ?? null,
		get getItemKey() {
			return getItemKey();
		},
		estimateSize: (index) => {
			const measuredSizes = sizes();

			return measuredSizes ? estimateOperationItemSize(options.rows.items[index], measuredSizes, options.density) : 0;
		},
		overscan: 12,
		get scrollMargin() {
			return scrollMargin();
		},
		get scrollPaddingStart() {
			return scrollMargin() + (options.density === 'compact' ? sizes()?.group ?? 0 : 0);
		},
		get rangeExtractor() {
			return rangeExtractor();
		}
	});

	const readSizes = () => {
		const element = scrollElement();

		if (!element) {
			return;
		}

		const style = getComputedStyle(element);
		const rootFontSize = Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize);
		const next = {
			compact: operationTokenPixels(style.getPropertyValue('--row-height-compact'), rootFontSize),
			comfortable: operationTokenPixels(style.getPropertyValue('--row-height-comfortable'), rootFontSize),
			group: operationTokenPixels(style.getPropertyValue('--row-height-group'), rootFontSize)
		};

		setSizes((previous) => previous?.compact === next.compact
			&& previous.comfortable === next.comfortable && previous.group === next.group ? previous : next);
		setScrollMargin(element.querySelector('thead')?.getBoundingClientRect().height ?? Number.parseFloat(style.paddingBlockStart));
	};

	onMount(() => {
		readSizes();

		const element = scrollElement();
		const observer = new ResizeObserver(readSizes);

		if (element) {
			observer.observe(element);

			const header = element.querySelector('thead');

			if (header) {
				observer.observe(header);
			}
		}

		onCleanup(() => observer.disconnect());
	});

	createEffect(on(() => options.density, readSizes, { defer: true }));
	createEffect(on(sizes, () => virtualizer.measure(), { defer: true }));
	createEffect(on(() => options.scrollResetKey, (_, previous) => {
		if (previous !== undefined) {
			suppressedRevealId = targetOperationId();
		}

		virtualizer.scrollToOffset(0, { behavior: 'auto' });
	}));

	// Only selection/data changes reveal a row. User scrolling must never snap back to the selection.
	createEffect(on(
		[() => options.highlightOperationId, () => options.selectedOperationId, () => options.rows, sizes] as const,
		([highlightId, selectedId, rows, measuredSizes], previous) => {
			// Finishing the flash does not undo a manual scroll made during the highlight.
			if (previous && !highlightId && selectedId === previous[1] && rows === previous[2] && measuredSizes === previous[3]) {
				return;
			}

			const id = targetOperationId();
			const index = id ? options.rows.operationIndexById.get(id) : undefined;

			// A reset wins over an unchanged selection retained by the details panel, including async ledger replacement.
			if (id !== suppressedRevealId && index !== undefined && sizes()) {
				suppressedRevealId = undefined;
				virtualizer.scrollToIndex(index, { align: 'auto', behavior: 'auto' });
			}
		}
	));

	return { scrollMargin, setScrollElement, virtualizer };
}
