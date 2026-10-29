import type { OperationVirtualItem } from './operation-virtual-items';

export type OperationVirtualSizes = {
	compact: number;
	comfortable: number;
	group: number;
};

/** CSS custom properties retain rem units in getComputedStyle, unlike computed layout properties. */
export function operationTokenPixels(value: string, rootFontSize: number): number {
	const size = Number.parseFloat(value);

	return value.trim().endsWith('rem') ? size * rootFontSize : size;
}

export function estimateOperationItemSize(
	item: OperationVirtualItem,
	sizes: OperationVirtualSizes,
	density: 'compact' | 'comfortable'
): number {
	return item.kind === 'group' ? sizes.group : sizes[density];
}
