import type { SecurityPasskey, SecuritySession } from '@i-finances/contracts';

import type { SecurityClient } from '../api';

const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
	return new Date(Date.now() - days * DAY_MS).toISOString();
}

/** Passkeys of the `D-Security` board: a phone used today and a laptop used a while ago. */
export const STORY_PASSKEYS: SecurityPasskey[] = [
	{ createdAt: daysAgo(40), deviceName: 'iPhone 15 · Safari', id: 'passkey-phone', lastUsedAt: daysAgo(0) },
	{ createdAt: daysAgo(230), deviceName: 'MacBook · Chrome', id: 'passkey-laptop', lastUsedAt: daysAgo(19) }
];

/** Sessions of the `D-Security` board: this one, a laptop and an unknown device. */
export const STORY_SESSIONS: SecuritySession[] = [
	{
		browser: 'Safari',
		createdAt: daysAgo(3),
		expiresAt: daysAgo(-27),
		id: 'session-current',
		ipAddress: '203.0.113.24',
		isCurrent: true,
		lastSeenAt: daysAgo(0),
		os: 'iOS',
		userAgent: 'story'
	},
	{
		browser: 'Chrome',
		createdAt: daysAgo(9),
		expiresAt: daysAgo(-21),
		id: 'session-laptop',
		ipAddress: '203.0.113.58',
		isCurrent: false,
		lastSeenAt: daysAgo(4),
		os: 'macOS',
		userAgent: 'story'
	},
	{
		browser: null,
		createdAt: daysAgo(19),
		expiresAt: daysAgo(-11),
		id: 'session-unknown',
		ipAddress: '198.51.100.7',
		isCurrent: false,
		lastSeenAt: daysAgo(19),
		os: null,
		userAgent: null
	}
];

/** A promise that never settles: the list stays in its loading state. */
export function never<TValue>(): Promise<TValue> {
	return new Promise<TValue>(() => undefined);
}

const FAILURE = { errorCode: 'unexpected', message: 'Не удалось выполнить действие. Попробуйте ещё раз.', ok: false } as const;

export type FakeSecurityClient = Pick<
	SecurityClient,
	'deletePasskey' | 'listPasskeys' | 'listSessions' | 'revokeOtherSessions' | 'revokeSession'
> & Pick<SecurityClient, 'changePassword'>;

/** A client that answers from memory: lists change when keys and sessions are removed, like the real one. */
export function createFakeSecurityClient(options: {
	changePassword?: SecurityClient['changePassword'];
	deletePasskey?: SecurityClient['deletePasskey'];
	failLists?: boolean;
	loading?: boolean;
	passkeys?: SecurityPasskey[];
	sessions?: SecuritySession[];
} = {}): FakeSecurityClient {
	let passkeys = options.passkeys ?? STORY_PASSKEYS;
	let sessions = options.sessions ?? STORY_SESSIONS;

	return {
		changePassword: options.changePassword ?? (async () => ({ result: { ok: true, revokedSessionCount: 2 } })),
		deletePasskey: options.deletePasskey ?? (async (id) => {
			passkeys = passkeys.filter((passkey) => passkey.id !== id);

			return { ok: true };
		}),
		listPasskeys: () => {
			if (options.loading) {
				return never();
			}

			return options.failLists ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, passkeys });
		},
		listSessions: () => {
			if (options.loading) {
				return never();
			}

			return Promise.resolve(options.failLists ? FAILURE : { ok: true, sessions });
		},
		revokeOtherSessions: async () => {
			const revokedSessionCount = sessions.filter((session) => !session.isCurrent).length;

			sessions = sessions.filter((session) => session.isCurrent);

			return { ok: true, revokedSessionCount };
		},
		revokeSession: async (id) => {
			sessions = sessions.filter((session) => session.id !== id);

			return { ok: true };
		}
	};
}
