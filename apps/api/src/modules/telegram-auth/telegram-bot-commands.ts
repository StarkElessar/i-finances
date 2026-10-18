import { TELEGRAM_LOGIN_CODE_PATTERN } from '@i-finances/contracts';

const START_COMMAND = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/u;
const CALLBACK_PREFIX = 'tgl';
const CALLBACK_DATA = /^tgl:(ok|no):([A-Za-z0-9_-]{32})$/u;
const LINK_CALLBACK_PREFIX = 'tgk';
const LINK_CALLBACK_DATA = /^tgk:(ok|no):([A-Za-z0-9_-]{32})$/u;

export type SignInCallbackAction = {
	code: string;
	kind: 'confirm' | 'reject';
};

/**
 * Reads `/start` and `/start <payload>` (what a `https://t.me/<bot>?start=<payload>` link sends).
 * Returns `undefined` for any other text, `null` for `/start` without a payload.
 */
export function parseStartCommand(text: string | undefined): string | null | undefined {
	const match = text === undefined ? null : START_COMMAND.exec(text.trim());

	if (match === null) {
		return undefined;
	}

	return match.at(1) ?? null;
}

/** The payload is a sign-in code only when it has the exact shape of one; anything else is not looked up. */
export function isSignInCode(payload: string): boolean {
	return TELEGRAM_LOGIN_CODE_PATTERN.test(payload);
}

/** `callback_data` of the «Войти» / «Это не я» buttons: `tgl:ok:<code>`, 39 bytes (Telegram allows 64). */
export function buildSignInCallbackData(action: SignInCallbackAction): string {
	return `${CALLBACK_PREFIX}:${action.kind === 'confirm' ? 'ok' : 'no'}:${action.code}`;
}

export function parseSignInCallbackData(data: string | undefined): SignInCallbackAction | undefined {
	const match = data === undefined ? null : CALLBACK_DATA.exec(data);

	if (match === null) {
		return undefined;
	}

	return { code: match[2], kind: match[1] === 'ok' ? 'confirm' : 'reject' };
}

/**
 * `callback_data` of the «Привязать» / «Это не я» buttons of a link request (A4): `tgk:ok:<code>`. A prefix of its own,
 * so a sign-in button can never act on a link request and the other way round, whatever the request says.
 */
export function buildLinkCallbackData(action: SignInCallbackAction): string {
	return `${LINK_CALLBACK_PREFIX}:${action.kind === 'confirm' ? 'ok' : 'no'}:${action.code}`;
}

export function parseLinkCallbackData(data: string | undefined): SignInCallbackAction | undefined {
	const match = data === undefined ? null : LINK_CALLBACK_DATA.exec(data);

	if (match === null) {
		return undefined;
	}

	return { code: match[2], kind: match[1] === 'ok' ? 'confirm' : 'reject' };
}
