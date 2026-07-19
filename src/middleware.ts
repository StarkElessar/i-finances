import { createMiddleware } from '@solidjs/start/middleware';
import type { FetchEvent } from '@solidjs/start/server';

import { getMockIsAuth } from '~/shared/lib/auth/mock-auth-state';

const SIGN_IN_PATH = '/sign-in';
const UI_KIT_PATH = '/ui-kit';
const REDIRECT_STATUS_CODE = 302;
const DOCUMENT_METHODS = new Set(['GET', 'HEAD']);

/**
 * Проверяет, относится ли путь к публичным auth-страницам.
 */
function isPublicAuthPath(pathname: string): boolean {
    return pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);
}

/**
 * Разрешает доступ к внутренним development-страницам только в dev-сборке.
 */
function isPublicDevelopmentPath(pathname: string): boolean {
    return import.meta.env.DEV && (pathname === UI_KIT_PATH || pathname.startsWith(`${UI_KIT_PATH}/`));
}

/**
 * Определяет, является ли запрос навигацией за HTML-документом.
 */
function isDocumentRequest(request: Request): boolean {
    if (!DOCUMENT_METHODS.has(request.method)) {
        return false;
    }

    const acceptHeader = request.headers.get('accept');
    return acceptHeader?.includes('text/html') ?? false;
}

/**
 * Собирает URL входа с параметром возврата на исходную страницу.
 */
function createSignInRedirectUrl(requestUrl: URL): URL {
    const redirectUrl = new URL(SIGN_IN_PATH, requestUrl.origin);
    const from = `${requestUrl.pathname}${requestUrl.search}`;

    redirectUrl.searchParams.set('from', from);

    return redirectUrl;
}

/**
 * Выполняет временный серверный guard для неавторизованных пользователей.
 */
function handleAuthGuardRequest(event: FetchEvent): Response | void {
    if (getMockIsAuth()) {
        return;
    }

    if (!isDocumentRequest(event.request)) {
        return;
    }

    const requestUrl = new URL(event.request.url);

    if (isPublicAuthPath(requestUrl.pathname) || isPublicDevelopmentPath(requestUrl.pathname)) {
        return;
    }

    return Response.redirect(createSignInRedirectUrl(requestUrl), REDIRECT_STATUS_CODE);
}

export default createMiddleware({
    onRequest: handleAuthGuardRequest
});
