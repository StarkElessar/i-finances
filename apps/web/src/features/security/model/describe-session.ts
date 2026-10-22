import type { SecuritySession } from '@i-finances/contracts';

import { capitalizeFirst, formatSecurityDay } from './format-security-date';

export const UNKNOWN_DEVICE_TITLE = 'Неизвестное устройство';

const PHONE_OS = new Set(['Android', 'iOS', 'iPadOS']);

export type SessionDeviceKind = 'desktop' | 'phone';

export type SessionRowView = {
	deviceKind: SessionDeviceKind;
	id: string;
	isCurrent: boolean;
	/** «Сегодня · IP ≈ 203.0.113.24»: the last activity as a date (no minutes, no «онлайн») and the rough address. */
	meta: string;
	/** «Safari · iOS», the browser or the system alone, or «Неизвестное устройство». */
	title: string;
};

function readTitle(session: SecuritySession): string {
	const parts = [session.browser, session.os].filter((part): part is string => part !== null && part.trim().length > 0);

	return parts.length === 0 ? UNKNOWN_DEVICE_TITLE : parts.join(' · ');
}

/** One row of the session list (mockup `M-Security`, `D-Security`). */
export function describeSession(session: SecuritySession, now: Date): SessionRowView {
	const lastSeen = formatSecurityDay(session.lastSeenAt, now);
	const parts: string[] = [];

	if (lastSeen !== null) {
		parts.push(capitalizeFirst(lastSeen));
	}

	if (session.ipAddress !== null && session.ipAddress.length > 0) {
		parts.push(`IP ≈ ${session.ipAddress}`);
	}

	return {
		deviceKind: session.os !== null && PHONE_OS.has(session.os) ? 'phone' : 'desktop',
		id: session.id,
		isCurrent: session.isCurrent,
		meta: parts.join(' · '),
		title: readTitle(session)
	};
}

/** The current session first, then the rest by the latest activity: the person's own device is never lost in the list. */
export function sortSessions(sessions: readonly SecuritySession[]): SecuritySession[] {
	return sessions.toSorted((left, right) => {
		if (left.isCurrent !== right.isCurrent) {
			return left.isCurrent ? -1 : 1;
		}

		return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt);
	});
}
