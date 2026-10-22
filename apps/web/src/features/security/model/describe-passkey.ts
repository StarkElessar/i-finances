import type { SecurityPasskey } from '@i-finances/contracts';

import { formatSecurityDay } from './format-security-date';

export const UNNAMED_PASSKEY_TITLE = 'Ключ доступа';

const PHONE_NAME = /iPhone|iPad|iOS|Android|Pixel|Galaxy/i;

export type PasskeyDeviceKind = 'desktop' | 'phone';

export type PasskeyRowView = {
	/** Guessed from the device name: a phone or tablet gets the phone icon, anything else the monitor. */
	deviceKind: PasskeyDeviceKind;
	id: string;
	/** «Создан 12 сентября 2026 · использован сегодня». */
	meta: string;
	title: string;
};

/** One row of the passkey list: the device, the creation date and the last use (mockup `M-Security`, `D-Security`). */
export function describePasskey(passkey: SecurityPasskey, now: Date): PasskeyRowView {
	const created = formatSecurityDay(passkey.createdAt, now, { withYear: true });
	const lastUsed = passkey.lastUsedAt === null ? null : formatSecurityDay(passkey.lastUsedAt, now);
	const parts: string[] = [];

	if (created !== null) {
		parts.push(`Создан ${created}`);
	}

	parts.push(lastUsed === null ? 'ещё не использовался' : `использован ${lastUsed}`);

	const title = passkey.deviceName?.trim() || UNNAMED_PASSKEY_TITLE;

	return {
		deviceKind: PHONE_NAME.test(title) ? 'phone' : 'desktop',
		id: passkey.id,
		meta: parts.join(' · '),
		title
	};
}
