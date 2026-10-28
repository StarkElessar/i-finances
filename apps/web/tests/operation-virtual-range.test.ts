import { createOperationVirtualItems } from '@/views/home/model/operation-virtual-items';
import { getOperationVirtualRange } from '@/views/home/ui/operations-workspace/lib/operation-virtual-range';
import { createVirtualizedOperations } from '@/views/home/ui/operations-workspace/operations-virtualized.fixture';

import type { Range } from '@tanstack/solid-virtual';
import { describe, expect, it } from 'vitest';

const OPERATIONS = createVirtualizedOperations(40);

const ROWS = createOperationVirtualItems([
	{ id: 'first', label: 'First day', type: 'date', operations: OPERATIONS.slice(0, 20) },
	{ id: 'second', label: 'Second day', type: 'date', operations: OPERATIONS.slice(20) }
]);

const RANGE: Range = { startIndex: 24, endIndex: 26, overscan: 1, count: ROWS.items.length };

describe('getOperationVirtualRange', () => {
	it.each([false, true])('keeps a focused row before overscan (sticky heading: %s)', (keepGroupHeading) => {
		expect(getOperationVirtualRange({ rows: ROWS, range: RANGE, keepGroupHeading, focusedOperationId: 'operation-1' }))
			.toEqual(keepGroupHeading ? [1, 21, 23, 24, 25, 26, 27] : [1, 23, 24, 25, 26, 27]);
	});

	it('keeps the panel origin when focus has moved into the panel', () => {
		expect(getOperationVirtualRange({ rows: ROWS, range: RANGE, keepGroupHeading: false, selectedOperationId: 'operation-1' }))
			.toEqual([1, 23, 24, 25, 26, 27]);
	});

	it('keeps both distinct anchors in ascending order without filling the gaps', () => {
		expect(getOperationVirtualRange({
			rows: ROWS, range: RANGE, keepGroupHeading: true, focusedOperationId: 'operation-40', selectedOperationId: 'operation-1'
		})).toEqual([1, 21, 23, 24, 25, 26, 27, 41]);
	});

	it('deduplicates focused, selected and overscan indices', () => {
		expect(getOperationVirtualRange({
			rows: ROWS, range: RANGE, keepGroupHeading: true, focusedOperationId: 'operation-24', selectedOperationId: 'operation-24',
			panelOriginOperationId: 'operation-24'
		})).toEqual([21, 23, 24, 25, 26, 27]);
	});

	it('retains the panel origin after selection clears and focus has moved to another row', () => {
		expect(getOperationVirtualRange({
			rows: ROWS, range: RANGE, keepGroupHeading: false, focusedOperationId: 'operation-40', panelOriginOperationId: 'operation-1'
		})).toEqual([1, 23, 24, 25, 26, 27, 41]);
	});

	it('does not duplicate a group heading already in overscan', () => {
		expect(getOperationVirtualRange({ rows: ROWS, range: { ...RANGE, startIndex: 22 }, keepGroupHeading: true }))
			.toEqual([21, 22, 23, 24, 25, 26, 27]);
	});

	it('returns no indices for an empty list, including stale focus and selection', () => {
		expect(getOperationVirtualRange({
			rows: createOperationVirtualItems([]), range: { ...RANGE, count: 0 }, keepGroupHeading: true,
			focusedOperationId: 'operation-1', selectedOperationId: 'operation-40', panelOriginOperationId: 'operation-20'
		})).toEqual([]);
	});

	it('keeps focus on the last item beyond overscan', () => {
		expect(getOperationVirtualRange({ rows: ROWS, range: RANGE, keepGroupHeading: false, focusedOperationId: 'operation-40' }))
			.toEqual([23, 24, 25, 26, 27, 41]);
	});

	it('ignores ids removed by filtering or deletion', () => {
		expect(getOperationVirtualRange({
			rows: ROWS, range: RANGE, keepGroupHeading: false, focusedOperationId: 'missing', selectedOperationId: 'removed'
		})).toEqual([23, 24, 25, 26, 27]);
	});
});
