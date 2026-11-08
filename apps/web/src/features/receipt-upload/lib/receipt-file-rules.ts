/** What the server accepts (HEIC and HEIF are converted there); the same list the receipts page used. */
export const RECEIPT_IMAGE_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif';

export const RECEIPT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(RECEIPT_IMAGE_ACCEPT.split(','));

// Some phones hand over a HEIC photo without a MIME type; the extension is then the only hint.
const ALLOWED_EXTENSION = /\.(?:jpe?g|png|heic|heif)$/i;

/** The reason a file cannot be sent, as the end of a sentence («Не загрузилось 1 из 3: …»), or `undefined` when it can. */
export function validateReceiptFile(file: File): string | undefined {
	if (file.size === 0) {
		return 'файл пустой';
	}

	if (file.size > RECEIPT_IMAGE_MAX_BYTES) {
		return 'файл больше 15 МБ';
	}

	const isAllowedType = file.type === ''
		? ALLOWED_EXTENSION.test(file.name)
		: ALLOWED_MIME_TYPES.has(file.type);

	return isAllowedType ? undefined : 'нужны JPEG, PNG или HEIC';
}
