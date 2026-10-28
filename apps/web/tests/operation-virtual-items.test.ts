import type { OperationGroup } from '@/entities/operation';
import { createOperationGroups } from '@/entities/operation/model/selectors';

import { createOperationVirtualItems } from '@/views/home/model/operation-virtual-items';
import { estimateOperationItemSize, operationTokenPixels } from '@/views/home/model/operation-virtual-size';
import { createVirtualizedOperations } from '@/views/home/ui/operations-workspace/operations-virtualized.fixture';

import { describe, expect, it } from 'vitest';

function createGroups(): OperationGroup[] {
	const operations = createVirtualizedOperations(3);

	return [
		{ id: 'first', label: '2026-01-01', type: 'date', operations: operations.slice(0, 2), differenceMinor: -200 },
		{ id: 'second', label: '2026-01-02', type: 'date', operations: operations.slice(2), differenceMinor: -100 }
	];
}

describe('createOperationVirtualItems', () => {
	it('interleaves headings and operations in the supplied order, retaining data and day totals', () => {
		const groups = createGroups();
		const { items } = createOperationVirtualItems(groups);

		expect(items.map((item) => item.kind)).toEqual(['group', 'operation', 'operation', 'group', 'operation']);
		expect(items[0]).toMatchObject({ group: groups[0], groupIndex: 0 });
		expect(items[0].kind === 'group' && items[0].group).toBe(groups[0]);
		expect(items[1].kind === 'operation' && items[1].operation).toBe(groups[0].operations[0]);
		expect(items[1]).toMatchObject({ groupIndex: 0, isLastInGroup: false });
		expect(items[2]).toMatchObject({ groupIndex: 0, isLastInGroup: true });
		expect(items[4]).toMatchObject({ groupIndex: 3, isLastInGroup: true });
		expect(groups[0].operations).toHaveLength(2);
	});

	it('namespaces stable keys even when a group and an operation have the same id', () => {
		const groups = createGroups();

		groups[0].id = groups[0].operations[0].id;

		const { items } = createOperationVirtualItems(groups);

		expect(items.map((item) => item.key)).toEqual([
			'group:operation-1', 'operation:operation-1', 'operation:operation-2', 'group:second', 'operation:operation-3'
		]);
		expect(new Set(items.map((item) => item.key)).size).toBe(items.length);

		const reversed = createOperationVirtualItems(groups.toReversed());

		expect(reversed.items.find((item) => item.key === items[1].key)?.key).toBe(items[1].key);
		expect(reversed.operationIndexById.get('operation-1')).toBe(3);
	});

	it('indexes operations in the flat list, including the preceding headings', () => {
		const { operationIndexById, items } = createOperationVirtualItems(createGroups());

		expect([...operationIndexById]).toEqual([['operation-1', 1], ['operation-2', 2], ['operation-3', 4]]);
		expect(operationIndexById.get('missing')).toBeUndefined();

		for (const [id, index] of operationIndexById) {
			expect(items[index].key).toBe(`operation:${id}`);
		}
	});

	it('returns an empty list and index for no groups or only empty groups', () => {
		expect(createOperationVirtualItems([])).toEqual({ items: [], operationIndexById: new Map() });
		expect(createOperationVirtualItems([{ id: 'empty', label: 'Сумма', type: 'amount', operations: [] }]))
			.toEqual({ items: [], operationIndexById: new Map() });
	});

	it('skips empty groups between populated groups without disturbing indices', () => {
		const groups = createGroups();
		const empty: OperationGroup = { id: 'empty', label: '', type: 'date', operations: [] };

		expect(createOperationVirtualItems([empty, groups[0], empty, groups[1], empty]))
			.toEqual(createOperationVirtualItems(groups));
	});

	it('builds a complete, collision-free index for 5000 operations across a year', () => {
		const operations = createVirtualizedOperations(5000);
		const groups = createOperationGroups(operations, operations, { field: 'date', direction: 'desc' });
		const { items, operationIndexById } = createOperationVirtualItems(groups);

		expect(operationIndexById.size).toBe(5000);
		expect(items).toHaveLength(5000 + groups.length);
		expect(new Set(items.map((item) => item.key)).size).toBe(items.length);

		for (const operation of operations) {
			const index = operationIndexById.get(operation.id);

			expect(index).toBeDefined();
			expect(items[index ?? -1]).toMatchObject({ kind: 'operation', operation });
		}
	});
});

describe('operation height estimates', () => {
	it('converts computed CSS tokens from rem or px, including a changed root font size', () => {
		expect(operationTokenPixels(' 2.75rem ', 16)).toBe(44);
		expect(operationTokenPixels('4rem', 16)).toBe(64);
		expect(operationTokenPixels('2.75rem', 20)).toBe(55);
		expect(operationTokenPixels('44px', 20)).toBe(44);
	});

	it('uses the supplied row density and the independent heading token', () => {
		const { items } = createOperationVirtualItems(createGroups());
		const sizes = { compact: 44, comfortable: 64, group: 36 };

		expect(estimateOperationItemSize(items[0], sizes, 'compact')).toBe(36);
		expect(estimateOperationItemSize(items[0], sizes, 'comfortable')).toBe(36);
		expect(estimateOperationItemSize(items[1], sizes, 'compact')).toBe(44);
		expect(estimateOperationItemSize(items[1], sizes, 'comfortable')).toBe(64);
		expect(estimateOperationItemSize(items[1], { ...sizes, compact: 48 }, 'compact')).toBe(48);
	});
});
