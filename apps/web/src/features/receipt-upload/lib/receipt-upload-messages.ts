// Toast texts of the receipt upload (mockup M-ReceiptCapture). One batch, one toast.

export function uploadingMessage(current: number, total: number): string {
	return total === 1 ? 'Загружаем чек…' : `Загружаем чек ${current} из ${total}…`;
}

export function uploadedMessage(count: number): string {
	return count === 1 ? 'Чек загружен, обрабатывается' : `Загружено: ${count}, обрабатываются`;
}

export function uploadFailedMessage(failedCount: number, total: number, firstReason: string): string {
	return total === 1
		? `Не удалось загрузить чек: ${firstReason}`
		: `Не загрузилось ${failedCount} из ${total}: ${firstReason}`;
}

export function readyMessage(count: number): string {
	return count === 1 ? 'Чек готов к проверке' : `Готово чеков: ${count}`;
}

export function processingFailedMessage(count: number): string {
	return count === 1 ? 'Не удалось обработать чек' : `Не удалось обработать чеков: ${count}`;
}
