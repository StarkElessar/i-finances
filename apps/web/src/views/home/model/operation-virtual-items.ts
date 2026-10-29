import type { OperationGroup, OperationWithBalance } from '@/entities/operation';

export type OperationVirtualItem = {
	groupIndex: number;
	key: string;
} & ({
	group: OperationGroup;
	kind: 'group';
} | {
	isLastInGroup: boolean;
	kind: 'operation';
	operation: OperationWithBalance;
});

export type OperationVirtualItems = {
	items: OperationVirtualItem[];
	operationIndexById: Map<string, number>;
};

/** Keeps the existing group/operation order and references; empty groups have no visible rows. */
export function createOperationVirtualItems(groups: readonly OperationGroup[]): OperationVirtualItems {
	const items: OperationVirtualItem[] = [];
	const operationIndexById = new Map<string, number>();

	for (const group of groups) {
		if (group.operations.length === 0) {
			continue;
		}

		const groupIndex = items.length;

		items.push({ group, groupIndex, key: `group:${group.id}`, kind: 'group' });

		group.operations.forEach((operation, index) => {
			operationIndexById.set(operation.id, items.length);
			items.push({
				groupIndex,
				isLastInGroup: index === group.operations.length - 1,
				key: `operation:${operation.id}`,
				kind: 'operation',
				operation
			});
		});
	}

	return { items, operationIndexById };
}
