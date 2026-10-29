import type { Range } from '@tanstack/solid-virtual';
import { defaultRangeExtractor } from '@tanstack/solid-virtual';

import type { OperationVirtualItems } from '../../../model/operation-virtual-items';

type OperationVirtualRangeOptions = {
	focusedOperationId?: string;
	keepGroupHeading: boolean;
	panelOriginOperationId?: string;
	range: Range;
	rows: OperationVirtualItems;
	selectedOperationId?: string;
};

/** Adds focus anchors and the table's sticky heading without rendering the intervening rows. */
export function getOperationVirtualRange(options: OperationVirtualRangeOptions): number[] {
	if (options.rows.items.length === 0) {
		return [];
	}

	const indices = new Set(defaultRangeExtractor(options.range));

	if (options.keepGroupHeading) {
		indices.add(options.rows.items[options.range.startIndex].groupIndex);
	}

	for (const id of [options.focusedOperationId, options.panelOriginOperationId, options.selectedOperationId]) {
		const index = id === undefined ? undefined : options.rows.operationIndexById.get(id);

		if (index !== undefined) {
			indices.add(index);
		}
	}

	return [...indices].sort((left, right) => left - right);
}
