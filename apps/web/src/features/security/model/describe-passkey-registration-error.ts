/** A user-facing message for a browser-side WebAuthn registration error. */
export function describePasskeyRegistrationError(error: unknown): string {
	if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
		return 'Создание ключа доступа отменено.';
	}

	if (error instanceof DOMException && error.name === 'InvalidStateError') {
		return 'Ключ доступа для этого устройства уже добавлен.';
	}

	return 'Не удалось создать ключ доступа. Попробуйте ещё раз.';
}
