import type { ReceiptImport } from '@/entities/receipt-import';

export type EditableOperation = {
	amountMinor: number;
	categoryId: string | null;
	itemIndexes: number[];
	title: string;
};

export function buildInitialOperations(receiptImport: ReceiptImport): EditableOperation[] {
	const result = receiptImport.result;

	if (result === null) {
		return [];
	}

	const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));
	const groups = new Map<string, EditableOperation>();

	result.receipt.items.forEach((item, itemIndex) => {
		const categoryId = result.categorizedItems.find((entry) => entry.itemIndex === itemIndex)?.categoryId ?? null;
		const groupKey = categoryId ?? 'uncategorized';
		const group = groups.get(groupKey) ?? {
			amountMinor: 0,
			categoryId,
			itemIndexes: [],
			title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? 'Без категории'
		};

		group.amountMinor += item.totalMinor;
		group.itemIndexes.push(itemIndex);
		groups.set(groupKey, group);
	});

	// Zero-amount groups stay: a promo line priced at 0 still has to be visible so the
	// user can move it into another group or approve it as a zero-amount operation.
	return [...groups.values()];
}
