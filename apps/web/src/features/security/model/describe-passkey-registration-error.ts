/**
 * A user-facing message for a browser-side WebAuthn registration error. `startRegistration` of simplewebauthn wraps the
 * browser's `DOMException` into its own error and keeps the original name, so the name is read from any `Error`.
 */
export function describePasskeyRegistrationError(error: unknown): string {
	const name = error instanceof Error ? error.name : undefined;

	if (name === 'NotAllowedError' || name === 'AbortError') {
		return 'Создание ключа доступа отменено.';
	}

	if (name === 'InvalidStateError') {
		return 'Ключ доступа для этого устройства уже добавлен.';
	}

	return 'Не удалось создать ключ доступа. Попробуйте ещё раз.';
}
