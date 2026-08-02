import { getSessionFromRequest } from '~/server/auth/require-user';
import { validateReturnPath } from '~/server/auth/validate-return-path';

import { createMiddleware } from '@solidjs/start/middleware';
import type { FetchEvent } from '@solidjs/start/server';

const SIGN_IN_PATH = '/sign-in';
const UI_KIT_PATH = '/ui-kit';
const REDIRECT_STATUS_CODE = 302;
const DOCUMENT_METHODS = new Set(['GET', 'HEAD']);
const SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
} as const;

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
 * Собирает URL возврата для пользователя, который уже авторизован.
 */
function createAuthenticatedRedirectUrl(requestUrl: URL): URL {
	return new URL(validateReturnPath(requestUrl.searchParams.get('from')), requestUrl.origin);
}

/**
 * Applies baseline security headers without overriding explicit route headers.
 */
function applySecurityHeaders(headers: Headers): void {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		if (!headers.has(name)) {
			headers.set(name, value);
		}
	}
}

/**
 * Creates a mutable redirect response with the shared security headers.
 */
function createRedirectResponse(url: URL, status: number): Response {
	const response = new Response(null, {
		status,
		headers: {
			location: url.toString()
		}
	});

	applySecurityHeaders(response.headers);

	return response;
}

/**
 * Выполняет серверный guard для неавторизованных document navigation.
 */
async function handleAuthGuardRequest(event: FetchEvent): Promise<Response | void> {
	if (!isDocumentRequest(event.request)) {
		return;
	}

	const requestUrl = new URL(event.request.url);

	if (isPublicDevelopmentPath(requestUrl.pathname)) {
		return;
	}

	const session = await getSessionFromRequest(event.request);

	if (isPublicAuthPath(requestUrl.pathname)) {
		return session
			? createRedirectResponse(createAuthenticatedRedirectUrl(requestUrl), REDIRECT_STATUS_CODE)
			: undefined;
	}

	if (session) {
		return;
	}

	return createRedirectResponse(createSignInRedirectUrl(requestUrl), REDIRECT_STATUS_CODE);
}

/**
 * Adds baseline security headers to non-short-circuited responses.
 */
function handleSecurityHeaders(event: FetchEvent, response: { body?: unknown }): void {
	applySecurityHeaders(event.response.headers);

	if (response.body instanceof Response) {
		applySecurityHeaders(response.body.headers);
	}
}

export default createMiddleware({
	onRequest: handleAuthGuardRequest,
	onBeforeResponse: handleSecurityHeaders
});
