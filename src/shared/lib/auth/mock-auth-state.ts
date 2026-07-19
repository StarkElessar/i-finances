import { createSignal } from 'solid-js';

const [isAuthSignal, setIsAuthSignal] = createSignal(false);

/**
 * Возвращает текущее моковое состояние авторизации.
 */
export function getMockIsAuth(): boolean {
    return isAuthSignal();
}

/**
 * Обновляет моковое состояние авторизации для локальной разработки.
 */
export function setMockIsAuth(value: boolean): void {
    setIsAuthSignal(value);
}
