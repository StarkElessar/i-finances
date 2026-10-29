import type { Range } from '@tanstack/solid-virtual';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js';

import type { OperationVirtualItems } from '../../../model/operation-virtual-items';
import type { OperationVirtualSizes } from '../../../model/operation-virtual-size';
import { estimateOperationItemSize, operationTokenPixels } from '../../../model/operation-virtual-size';

import { getOperationVirtualRange } from './operation-virtual-range';

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
	const [focusedOperationId, setFocusedOperationId] = createSignal<string>();
	const [panelOriginOperationId, setPanelOriginOperationId] = createSignal<string>();
	const getItemKey = createMemo(() => {
		const items = options.rows.items;

		return (index: number) => items[index].key;
	});
	const rangeExtractor = createMemo(() => {
		const rows = options.rows;
		const keepGroupHeading = options.density === 'compact';
		const focusedId = focusedOperationId();
		const panelOriginId = panelOriginOperationId();
		const selectedOperationId = options.selectedOperationId;

		// Pin the actual DOM focus anchor instead of scrolling/remounting it asynchronously on close.
		// Retain the panel's original anchor even if focus moves to another row: selection clears before focus is restored.
		return (range: Range) => getOperationVirtualRange({
			focusedOperationId: focusedId, keepGroupHeading, panelOriginOperationId: panelOriginId, range, rows, selectedOperationId
		});
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

	const handleFocusIn = (event: FocusEvent) => {
		const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null;
		const index = element?.dataset.index;
		const item = index === undefined ? undefined : options.rows.items[Number(index)];

		setFocusedOperationId(item?.kind === 'operation' ? item.operation.id : undefined);

		if (options.selectedOperationId === undefined) {
			setPanelOriginOperationId(undefined);
		}
	};

	let lastPointerDownAt = Number.NEGATIVE_INFINITY;
	const handlePointerDown = () => {
		lastPointerDownAt = performance.now();
	};
	// Solid moves a retained row while it reconciles the window, and a moved element loses focus with no new target.
	// A pointer press just before is a deliberate click on an empty area, which must not pull focus back.
	const handleFocusOut = (event: FocusEvent) => {
		const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-index]') : null;

		if (!row || event.relatedTarget !== null || performance.now() - lastPointerDownAt < 500) {
			return;
		}

		queueMicrotask(() => {
			const { activeElement } = row.ownerDocument;

			if (row.isConnected && (activeElement === null || activeElement === row.ownerDocument.body)) {
				row.focus({ preventScroll: true });
			}
		});
	};

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

	createEffect(on(() => options.selectedOperationId, (id, previousId) => {
		if (id !== undefined && previousId === undefined) {
			setPanelOriginOperationId(focusedOperationId() ?? id);
		}
	}));

	onMount(() => {
		readSizes();

		const element = scrollElement();
		const observer = new ResizeObserver(readSizes);

		if (element) {
			element.addEventListener('focusin', handleFocusIn);
			element.addEventListener('focusout', handleFocusOut);
			element.addEventListener('pointerdown', handlePointerDown);
			observer.observe(element);

			const header = element.querySelector('thead');

			if (header) {
				observer.observe(header);
			}
		}

		onCleanup(() => {
			element?.removeEventListener('focusin', handleFocusIn);
			element?.removeEventListener('focusout', handleFocusOut);
			element?.removeEventListener('pointerdown', handlePointerDown);
			observer.disconnect();
		});
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
