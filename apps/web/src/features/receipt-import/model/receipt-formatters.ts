import type { ReceiptImport, ReceiptWorkerResult } from '@i-finances/contracts';

export const receiptStatusLabels: Record<ReceiptImport['status'], string> = {
	approved: 'Подтверждён',
	approving: 'Создаём операции',
	cancelled: 'Отменён',
	failed: 'Ошибка обработки',
	needs_review: 'Требует проверки',
	processing: 'Обрабатывается',
	queued: 'В очереди',
	revision_requested: 'Повторная обработка'
};

export function formatReceiptAmount(amountMinor: number): string {
	return new Intl.NumberFormat('ru-BY', {
		currency: 'BYN',
		minimumFractionDigits: 2,
		style: 'currency'
	}).format(amountMinor / 100);
}

export function getReceiptMerchantName(result: ReceiptWorkerResult): string {
	return result.receipt.merchant.displayName
		?? result.receipt.merchant.legalName
		?? 'Продавец не распознан';
}

export function getReceiptCategoryName(receipt: ReceiptImport, categoryId: string | null): string {
	if (categoryId === null) {
		return 'Без категории';
	}

	return receipt.categories.find((category) => category.id === categoryId)?.name ?? 'Неизвестная категория';
}
