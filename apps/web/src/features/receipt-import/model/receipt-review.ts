import {
	type ReceiptImport,
	type ReceiptReview,
	receiptReviewSchema
} from '@i-finances/contracts';

export function formatReceiptAmountInput(amountMinor: number): string {
	return (amountMinor / 100).toFixed(2);
}

export function readReceiptReviewFields(
	formData: FormData,
	receipt: ReceiptImport
): ReceiptReview | undefined {
	if (receipt.result === null) {
		return undefined;
	}

	const items = receipt.result.receipt.items.map((_item, index) => {
		const quantityValue = readFormString(formData, `item-${index}-quantity`);
		const unitPriceValue = readFormString(formData, `item-${index}-unit-price`);
		const categorizedItem = receipt.result?.categorizedItems.find(
			(candidate) => candidate.itemIndex === index
		);

		return {
			categoryId: categorizedItem?.categoryId ?? null,
			discountMinor: parseAmount(readFormString(formData, `item-${index}-discount`)),
			name: readFormString(formData, `item-${index}-name`),
			quantity: quantityValue.length === 0 ? null : parseQuantity(quantityValue),
			totalMinor: parseAmount(readFormString(formData, `item-${index}-total`)),
			unitPriceMinor: unitPriceValue.length === 0 ? null : parseAmount(unitPriceValue)
		};
	}).map((item, index) => ({
		...item,
		categoryId: readFormString(formData, `item-${index}-category`) || null
	}));

	const review = receiptReviewSchema.safeParse({
		categorizedItems: items.map((item, itemIndex) => ({
			categoryId: item.categoryId,
			confidence: receipt.result?.categorizedItems.find((candidate) => candidate.itemIndex === itemIndex)?.confidence ?? null,
			itemIndex
		})),
		happenedOn: readFormString(formData, 'happenedOn'),
		items: items.map(({ categoryId: _categoryId, ...item }) => item),
		merchant: {
			address: readNullableFormString(formData, 'merchant-address'),
			displayName: readNullableFormString(formData, 'merchant-display-name'),
			legalName: readNullableFormString(formData, 'merchant-legal-name'),
			unp: readNullableFormString(formData, 'merchant-unp')
		},
		totalAmountMinor: parseAmount(readFormString(formData, 'total-amount'))
	});

	return review.success ? review.data : undefined;
}

function parseAmount(value: string): number {
	const normalized = value.trim().replace(',', '.');

	if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
		return Number.NaN;
	}

	const [whole, fraction = ''] = normalized.split('.');
	const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

	return Number.isSafeInteger(amountMinor) ? amountMinor : Number.NaN;
}

function parseQuantity(value: string): number {
	const quantity = Number(value.trim().replace(',', '.'));

	return Number.isFinite(quantity) ? quantity : Number.NaN;
}

function readFormString(formData: FormData, name: string): string {
	const value = formData.get(name);

	return typeof value === 'string' ? value.trim() : '';
}

function readNullableFormString(formData: FormData, name: string): string | null {
	const value = readFormString(formData, name);

	return value.length === 0 ? null : value;
}
