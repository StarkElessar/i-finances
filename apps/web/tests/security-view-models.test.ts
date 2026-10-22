import {
	type ChangePasswordOutcome,
	describeChangePasswordResult,
	formatRevokedSessions,
	validateChangePassword
} from '@/features/security/model/change-password-outcome';
import { describePasskey } from '@/features/security/model/describe-passkey';
import { describePasskeyRegistrationError } from '@/features/security/model/describe-passkey-registration-error';
import { describeSession, sortSessions, UNKNOWN_DEVICE_TITLE } from '@/features/security/model/describe-session';
import { describeTelegramLink, LINK_BUTTON_LABEL } from '@/features/security/model/describe-telegram-link';
import { describeThisDevice } from '@/features/security/model/describe-this-device';
import { capitalizeFirst, formatSecurityDay } from '@/features/security/model/format-security-date';
import {
	describeDeletePasskeyResult,
	describeRevokeOtherSessionsResult,
	describeRevokeSessionResult
} from '@/features/security/model/security-action-outcome';
import type { TelegramLinkState } from '@/features/security/model/telegram-link-state';

import type { SecurityFailure, SecuritySession } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

// Noon in the local time zone, so «сегодня» and the dates do not depend on the zone of the machine.
const NOW = new Date(2026, 9, 21, 12, 0, 0);

function localIso(year: number, monthIndex: number, day: number): string {
	return new Date(year, monthIndex, day, 9, 30, 0).toISOString();
}

const failure = (errorCode: SecurityFailure['errorCode'], fieldErrors?: Record<string, string>): SecurityFailure => ({
	errorCode,
	fieldErrors,
	message: `text of ${errorCode}`,
	ok: false
});

describe('formatSecurityDay', () => {
	it('writes today as «сегодня» and other days without a time', () => {
		expect(formatSecurityDay(localIso(2026, 9, 21), NOW)).toBe('сегодня');
		expect(formatSecurityDay(localIso(2026, 9, 17), NOW)).toBe('17 октября');
	});

	it('adds the year for another year or when asked', () => {
		expect(formatSecurityDay(localIso(2025, 11, 31), NOW)).toBe('31 декабря 2025');
		expect(formatSecurityDay(localIso(2026, 8, 12), NOW, { withYear: true })).toBe('12 сентября 2026');
	});

	it('gives null for a value that is not a date', () => {
		expect(formatSecurityDay('not a date', NOW)).toBeNull();
	});

	it('capitalizes the first letter', () => {
		expect(capitalizeFirst('сегодня')).toBe('Сегодня');
		expect(capitalizeFirst('')).toBe('');
	});
});

describe('describePasskey', () => {
	it('shows the device, the creation date with the year and the last use', () => {
		expect(describePasskey({
			createdAt: localIso(2026, 8, 12),
			deviceName: 'iPhone 15 · Safari',
			id: 'p1',
			lastUsedAt: localIso(2026, 9, 21)
		}, NOW)).toEqual({
			deviceKind: 'phone',
			id: 'p1',
			meta: 'Создан 12 сентября 2026 · использован сегодня',
			title: 'iPhone 15 · Safari'
		});
	});

	it('says a key was not used yet and names an unnamed one', () => {
		expect(describePasskey({ createdAt: localIso(2026, 2, 3), deviceName: null, id: 'p2', lastUsedAt: null }, NOW)).toMatchObject({
			deviceKind: 'desktop',
			meta: 'Создан 3 марта 2026 · ещё не использовался',
			title: 'Ключ доступа'
		});
		const blank = { createdAt: localIso(2026, 2, 3), deviceName: '   ', id: 'p3', lastUsedAt: null };

		expect(describePasskey(blank, NOW).title).toBe('Ключ доступа');
	});

	it('never prints a broken date', () => {
		const broken = { createdAt: 'x', deviceName: 'MacBook', id: 'p4', lastUsedAt: 'y' };

		expect(describePasskey(broken, NOW).meta).toBe('ещё не использовался');
	});
});

describe('describeSession', () => {
	const session = (patch: Partial<SecuritySession>): SecuritySession => ({
		browser: 'Chrome',
		createdAt: localIso(2026, 9, 1),
		expiresAt: localIso(2026, 10, 30),
		id: 's1',
		ipAddress: '203.0.113.58',
		isCurrent: false,
		lastSeenAt: localIso(2026, 9, 17),
		os: 'macOS',
		userAgent: 'x',
		...patch
	});

	it('names the browser and system, the last activity as a date and the rough address', () => {
		expect(describeSession(session({}), NOW)).toEqual({
			deviceKind: 'desktop',
			id: 's1',
			isCurrent: false,
			meta: '17 октября · IP ≈ 203.0.113.58',
			title: 'Chrome · macOS'
		});
	});

	it('capitalizes «Сегодня» and uses the phone icon for a phone system', () => {
		const phone = session({ browser: 'Safari', isCurrent: true, lastSeenAt: localIso(2026, 9, 21), os: 'iOS' });

		expect(describeSession(phone, NOW)).toMatchObject({
			deviceKind: 'phone',
			isCurrent: true,
			meta: 'Сегодня · IP ≈ 203.0.113.58',
			title: 'Safari · iOS'
		});
	});

	it('falls back to one half or to «Неизвестное устройство», and leaves out an unknown address', () => {
		expect(describeSession(session({ os: null }), NOW).title).toBe('Chrome');
		expect(describeSession(session({ browser: null }), NOW).title).toBe('macOS');
		expect(describeSession(session({ browser: null, ipAddress: null, os: null }), NOW)).toMatchObject({
			meta: '17 октября',
			title: UNKNOWN_DEVICE_TITLE
		});
	});

	it('shows no «online» and no minutes', () => {
		const { meta } = describeSession(session({ lastSeenAt: new Date(2026, 9, 21, 11, 59, 0).toISOString() }), NOW);

		expect(meta).not.toMatch(/\d{1,2}:\d{2}|онлайн/i);
	});

	it('sorts the current session first, then the latest activity first, without touching the input', () => {
		const input = [
			session({ id: 'old', lastSeenAt: localIso(2026, 9, 2) }),
			session({ id: 'new', lastSeenAt: localIso(2026, 9, 20) }),
			session({ id: 'me', isCurrent: true, lastSeenAt: localIso(2026, 9, 1) })
		];

		expect(sortSessions(input).map((item) => item.id)).toEqual(['me', 'new', 'old']);
		expect(input.map((item) => item.id)).toEqual(['old', 'new', 'me']);
	});
});

describe('describeThisDevice', () => {
	const WEBKIT = 'AppleWebKit/537.36 (KHTML, like Gecko)';
	const IPHONE = 'iPhone; CPU iPhone OS 17_5 like Mac OS X';
	const WINDOWS = 'Windows NT 10.0; Win64; x64';

	it.each([
		[`Mozilla/5.0 (${IPHONE}) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1`, 'Safari · iOS'],
		[`Mozilla/5.0 (${WINDOWS}) ${WEBKIT} Chrome/126.0.0.0 Safari/537.36`, 'Chrome · Windows'],
		[`Mozilla/5.0 (${WINDOWS}) ${WEBKIT} Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0`, 'Edge · Windows'],
		['Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox · macOS'],
		[`Mozilla/5.0 (Linux; Android 14; Pixel 8) ${WEBKIT} Chrome/126.0.0.0 Mobile Safari/537.36`, 'Chrome · Android'],
		[`Mozilla/5.0 (${IPHONE}) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1`, 'Chrome · iOS']
	])('names %#', (userAgent, expected) => {
		expect(describeThisDevice(userAgent)).toBe(expected);
	});

	it('gives nothing for an agent it cannot read, so the server keeps no made-up name', () => {
		expect(describeThisDevice('curl/8.4.0')).toBeUndefined();
		expect(describeThisDevice('')).toBeUndefined();
	});
});

describe('describePasskeyRegistrationError', () => {
	it('reads the name of the error the library wraps', () => {
		const named = (name: string) => Object.assign(new Error('x'), { name });

		expect(describePasskeyRegistrationError(named('NotAllowedError'))).toBe('Создание ключа доступа отменено.');
		expect(describePasskeyRegistrationError(named('AbortError'))).toBe('Создание ключа доступа отменено.');
		expect(describePasskeyRegistrationError(named('InvalidStateError')))
			.toBe('Ключ доступа для этого устройства уже добавлен.');

		const generic = 'Не удалось создать ключ доступа. Попробуйте ещё раз.';

		expect(describePasskeyRegistrationError(new Error('boom'))).toBe(generic);
		expect(describePasskeyRegistrationError('boom')).toBe(generic);
	});
});

describe('security action outcomes', () => {
	it('treats last-passkey as a hint and a vanished key as a refresh, not as failures', () => {
		expect(describeDeletePasskeyResult({ ok: true })).toEqual({ kind: 'deleted' });
		expect(describeDeletePasskeyResult(failure('last-passkey'))).toEqual({ kind: 'last-passkey' });
		expect(describeDeletePasskeyResult(failure('not-found'))).toEqual({ kind: 'gone' });
		expect(describeDeletePasskeyResult(failure('unexpected'))).toEqual({ kind: 'failed', message: 'text of unexpected' });
	});

	it('does not show 409 current-session as a failure', () => {
		expect(describeRevokeSessionResult({ ok: true })).toEqual({ kind: 'revoked' });
		expect(describeRevokeSessionResult(failure('current-session'))).toEqual({ kind: 'current' });
		expect(describeRevokeSessionResult(failure('not-found'))).toEqual({ kind: 'gone' });
		expect(describeRevokeSessionResult(failure('rate-limited'))).toEqual({ kind: 'failed', message: 'text of rate-limited' });
	});

	it('counts the sessions that «Завершить все остальные» ended', () => {
		expect(describeRevokeOtherSessionsResult({ ok: true, revokedSessionCount: 3 }))
			.toEqual({ kind: 'revoked', revokedSessionCount: 3 });
		expect(describeRevokeOtherSessionsResult(failure('unexpected'))).toEqual({ kind: 'failed', message: 'text of unexpected' });
	});
});

describe('change password', () => {
	it('checks the same rules as the server before any request', () => {
		expect(validateChangePassword('', 'long enough password')).toEqual({
			fieldErrors: { currentPassword: 'Введите текущий пароль.' },
			ok: false
		});
		expect(validateChangePassword('old password 1', 'short')).toEqual({
			fieldErrors: { newPassword: 'Пароль должен содержать не менее 12 символов.' },
			ok: false
		});
		expect(validateChangePassword('old password 1', 'exactly 12 ch')).toEqual({
			input: { currentPassword: 'old password 1', newPassword: 'exactly 12 ch' },
			ok: true
		});
	});

	it('shows a wrong current password at its field, as a field error and not as a lost session', () => {
		const message = 'Текущий пароль указан неверно.';
		const outcome = describeChangePasswordResult(failure('invalid-current-password', { currentPassword: message }));

		expect(outcome).toEqual<ChangePasswordOutcome>({
			fieldErrors: { currentPassword: 'Текущий пароль указан неверно.' },
			kind: 'field-errors',
			message: 'text of invalid-current-password'
		});
	});

	it('keeps only the known field names of the server', () => {
		expect(describeChangePasswordResult(failure('invalid-input', { newPassword: 'a', somethingElse: 'b' }))).toMatchObject({
			fieldErrors: { newPassword: 'a' },
			kind: 'field-errors'
		});
		expect(describeChangePasswordResult(failure('password-unchanged', { newPassword: 'same' })))
			.toMatchObject({ kind: 'field-errors' });
	});

	it('names the other outcomes', () => {
		expect(describeChangePasswordResult({ ok: true, revokedSessionCount: 2 })).toEqual({ kind: 'changed', revokedSessionCount: 2 });
		expect(describeChangePasswordResult(failure('rate-limited'))).toEqual({ kind: 'rate-limited', message: 'text of rate-limited' });
		expect(describeChangePasswordResult(failure('password-not-set')))
			.toEqual({ kind: 'password-not-set', message: 'text of password-not-set' });
		expect(describeChangePasswordResult(failure('unexpected'))).toEqual({ kind: 'failed', message: 'text of unexpected' });
		expect(formatRevokedSessions(2)).toBe('Завершено других сеансов: 2.');
		expect(formatRevokedSessions(0)).toBe('Завершено других сеансов: 0.');
	});
});

describe('describeTelegramLink', () => {
	const link = {
		appUrl: 'tg://resolve?domain=bot&start=x',
		botUrl: 'https://t.me/bot?start=x',
		code: 'x',
		expiresAtMs: 0,
		ttlMinutes: 10
	};

	it('prepares, offers the link with the forward warning, and waits with cancel', () => {
		expect(describeTelegramLink({ kind: 'idle' })).toMatchObject({ action: { kind: 'loading' }, banners: [] });
		expect(describeTelegramLink({ kind: 'ready', link })).toMatchObject({
			action: { botUrl: link.botUrl, kind: 'link', label: LINK_BUTTON_LABEL, variant: 'primary' },
			isCancellable: false,
			showForwardHint: true
		});

		const waiting = describeTelegramLink({ connectionLost: false, kind: 'waiting', link });

		expect(waiting).toMatchObject({
			action: { kind: 'link', label: 'Открыть Telegram ещё раз', variant: 'secondary' },
			isCancellable: true,
			showForwardHint: true
		});
		expect(waiting?.banners).toEqual([
			expect.objectContaining({ text: expect.stringContaining('Заявка действует 10 минут'), tone: 'info' })
		]);
	});

	it('adds the lost connection warning while waiting', () => {
		const waiting = describeTelegramLink({ connectionLost: true, kind: 'waiting', link });

		expect(waiting?.banners.map((banner) => banner.tone)).toEqual(['info', 'warning']);
	});

	it('hides the block when Telegram is off and leaves the success to its own panel', () => {
		expect(describeTelegramLink({ kind: 'unavailable' })).toBeNull();
		expect(describeTelegramLink({ kind: 'confirmed', telegram: { username: 'alexey' } })).toBeNull();
	});

	type Failed = Extract<TelegramLinkState, { kind: 'failed' }>;

	const failed = (reason: Failed['reason'], extra: Partial<Failed> = {}) =>
		describeTelegramLink({ kind: 'failed', message: `message of ${reason}`, reason, ...extra });

	it('shows the two 409 texts of the board as they are, the account one without a retry', () => {
		expect(failed('linked-elsewhere')).toMatchObject({
			action: { kind: 'restart' },
			banners: [{ text: 'message of linked-elsewhere', tone: 'danger' }]
		});
		expect(failed('account-has-telegram')).toMatchObject({
			action: { kind: 'none' },
			banners: [{ text: 'message of account-has-telegram', tone: 'danger' }]
		});
	});

	it('words expiry with the real lifetime, and offers a fresh start for the others', () => {
		expect(failed('expired', { ttlMinutes: 5 })?.banners[0]).toMatchObject({
			text: 'Прошло больше 5 минут. Начните привязку заново.',
			title: 'Ссылка устарела.'
		});
		expect(failed('browser-mismatch')).toMatchObject({ action: { kind: 'restart', label: 'Начать заново' } });
		expect(failed('rejected')).toMatchObject({ action: { kind: 'restart' }, banners: [{ tone: 'warning' }] });
		expect(failed('network')).toMatchObject({ action: { kind: 'restart' } });
		expect(failed('unexpected')).toMatchObject({ action: { kind: 'restart' } });
	});

	it('says when the request is retried after a 429', () => {
		const banner = failed('rate-limited', { retryAfterSeconds: 90 })?.banners[0];

		expect(banner?.text).toBe('Повторим автоматически через 2 мин.');
	});
});
