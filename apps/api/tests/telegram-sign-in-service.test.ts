import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { sessions, telegramAccounts, telegramLoginRequests, users } from '@/infrastructure/database/schema';
import { RegistrationInvitationLookup } from '@/modules/app-invitation';
import { FixedWindowRateLimiter, SessionRepository, SessionService } from '@/modules/auth';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { loadTelegramMessages } from '@/modules/telegram';
import {
	buildTelegramDisplayName,
	describeSignInDevice,
	describeSignInMoment,
	hashTelegramLoginSecret,
	parseSignInCallbackData,
	parseStartCommand,
	TelegramAccountRepository,
	type TelegramIdentity,
	TelegramLoginRequestRepository,
	telegramLoginSecretMatches,
	TelegramSignInService,
	type TelegramSignInServiceDependencies,
	UserTelegramReset
} from '@/modules/telegram-auth';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const NOW = new Date('2026-10-18T18:04:00.000Z');
const LATER = new Date(NOW.getTime() + 5 * 60 * 1000);
const AFTER_EXPIRY = new Date(NOW.getTime() + 11 * 60 * 1000);
const CODE = 'abcdefghijklmnopqrstuvwxyz012345';
const SECRET = 'browser-secret';
const ANNA: TelegramIdentity = { chatId: '1001', firstName: 'Анна', lastName: null, telegramId: '1001', username: 'anna_k' };

let connection: Database.Database;
let database: AppDatabase;
let requests: TelegramLoginRequestRepository;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	requests = new TelegramLoginRequestRepository(database);
	await requests.insert({
		code: CODE,
		createdAt: NOW,
		expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
		id: 'request-1',
		purpose: 'sign-in',
		secretHash: hashTelegramLoginSecret(SECRET)
	});
});

afterEach(() => {
	connection.close();
});

function status(): string | undefined {
	return database.select({ status: telegramLoginRequests.status }).from(telegramLoginRequests).get()?.status;
}

describe('TelegramLoginRequestRepository: every transition changes exactly one row once', () => {
	it('confirms a pending request once; a second confirmation (another person, a redelivery) is refused', async () => {
		expect(await requests.confirm({ id: 'request-1', identity: ANNA, now: LATER })).toBe(true);
		expect(await requests.confirm({ id: 'request-1', identity: { ...ANNA, telegramId: '6666' }, now: LATER })).toBe(false);
		expect((await requests.findByCode(CODE))?.identity?.telegramId).toBe('1001');
	});

	it('does not confirm or reject an expired request', async () => {
		expect(await requests.confirm({ id: 'request-1', identity: ANNA, now: AFTER_EXPIRY })).toBe(false);
		expect(await requests.reject({ id: 'request-1', now: AFTER_EXPIRY })).toBe(false);
		expect(status()).toBe('pending');
	});

	it('rejects only a pending request', async () => {
		await requests.confirm({ id: 'request-1', identity: ANNA, now: LATER });

		expect(await requests.reject({ id: 'request-1', now: LATER })).toBe(false);
		expect(status()).toBe('confirmed');
	});

	it('consumes a confirmed request once, only with its secret, only while alive', async () => {
		const secretHash = hashTelegramLoginSecret(SECRET);

		expect(requests.consume({ id: 'request-1', now: LATER, secretHash })).toBe(false);

		await requests.confirm({ id: 'request-1', identity: ANNA, now: LATER });

		expect(requests.consume({ id: 'request-1', now: LATER, secretHash: hashTelegramLoginSecret('other') })).toBe(false);
		expect(requests.consume({ id: 'request-1', now: AFTER_EXPIRY, secretHash })).toBe(false);
		expect(requests.consume({ id: 'request-1', now: LATER, secretHash })).toBe(true);
		expect(requests.consume({ id: 'request-1', now: LATER, secretHash })).toBe(false);
		expect(status()).toBe('used');
	});

	it('cancels a pending or confirmed request of the same secret, never a used one', async () => {
		expect(await requests.cancel({ id: 'request-1', secretHash: hashTelegramLoginSecret('other') })).toBe(false);
		expect(await requests.cancel({ id: 'request-1', secretHash: hashTelegramLoginSecret(SECRET) })).toBe(true);
		expect(status()).toBe('rejected');
		expect(await requests.cancel({ id: 'request-1', secretHash: hashTelegramLoginSecret(SECRET) })).toBe(false);
	});

	it('removes requests older than the given moment only', async () => {
		expect(await requests.deleteCreatedBefore(NOW)).toBe(0);
		expect(await requests.deleteCreatedBefore(LATER)).toBe(1);
	});
});

describe('TelegramSignInService.complete under a race', () => {
	/**
	 * Two polls of the same browser (two tabs) read the confirmed request before either consumes it: `findByCode` waits
	 * at a barrier until both have read. Only the conditional `confirmed → used` then decides who gets the session.
	 */
	it('gives exactly one session when both polls saw «confirmed»', async () => {
		await requests.confirm({ id: 'request-1', identity: ANNA, now: LATER });

		let waiting = 0;
		let release: () => void = () => undefined;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const racingRequests = {
			cancel: requests.cancel.bind(requests),
			confirm: requests.confirm.bind(requests),
			deleteCreatedBefore: requests.deleteCreatedBefore.bind(requests),
			findByCode: async (code: string) => {
				const found = await requests.findByCode(code);

				waiting += 1;

				if (waiting === 2) {
					release();
				}

				await barrier;

				return found;
			},
			findById: requests.findById.bind(requests),
			insert: requests.insert.bind(requests),
			reject: requests.reject.bind(requests)
		};
		const service = new TelegramSignInService({
			accounts: new TelegramAccountRepository(database),
			botClient: undefined,
			completeRateLimiter: new FixedWindowRateLimiter({ maxRequests: 100, windowMilliseconds: 60_000 }),
			config: {
				botUsername: 'bot_name',
				devLoginEnabled: false,
				loginTtlMilliseconds: 600_000,
				registrationEnabled: true,
				signInAvailable: true,
				siteHost: 'localhost:5173'
			},
			households: new HouseholdResolver(new HouseholdRepository(database)),
			invitations: new RegistrationInvitationLookup(database),
			// No bot here: link requests never reach this test.
			link: {
				confirmFromBot: async () => {
					throw new Error('unexpected link confirmation');
				},
				offer: async () => {
					throw new Error('unexpected link offer');
				},
				rejectFromBot: async () => {
					throw new Error('unexpected link rejection');
				}
			},
			messages: loadTelegramMessages(),
			now: () => LATER,
			requests: racingRequests,
			sessionService: new SessionService(new SessionRepository(database), {
				config: {
					origin: 'http://localhost:5173',
					sessionCookieName: 'test_session',
					sessionTtlMilliseconds: 86_400_000,
					trustedProxyCount: 0,
					webauthnRpId: 'localhost',
					webauthnRpName: 'iFinances'
				},
				now: () => LATER
			}),
			startRateLimiter: new FixedWindowRateLimiter({ maxRequests: 100, windowMilliseconds: 60_000 })
		});

		const outcomes = await Promise.all([
			service.complete({ code: CODE }, SECRET, {}),
			service.complete({ code: CODE }, SECRET, {})
		]);

		expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['confirmed', 'failed']);
		expect(outcomes.find((outcome) => outcome.kind === 'failed')).toMatchObject({ endsRequest: true, errorCode: 'login-expired' });
		expect(await database.select().from(sessions)).toHaveLength(1);
		expect(await database.select().from(users).where(eq(users.username, 'tg-1001'))).toHaveLength(1);
	});
});

describe('TelegramSignInService.complete against a parallel telegram:reset (Р10)', () => {
	const PASSWORD_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g';

	function createSessionService(): SessionService {
		return new SessionService(new SessionRepository(database), {
			config: {
				origin: 'http://localhost:5173',
				sessionCookieName: 'test_session',
				sessionTtlMilliseconds: 86_400_000,
				trustedProxyCount: 0,
				webauthnRpId: 'localhost',
				webauthnRpName: 'iFinances'
			},
			now: () => LATER
		});
	}

	function createService(accounts: TelegramSignInServiceDependencies['accounts']): TelegramSignInService {
		return new TelegramSignInService({
			accounts,
			botClient: undefined,
			completeRateLimiter: new FixedWindowRateLimiter({ maxRequests: 100, windowMilliseconds: 60_000 }),
			config: {
				botUsername: 'bot_name',
				devLoginEnabled: false,
				loginTtlMilliseconds: 600_000,
				registrationEnabled: false,
				signInAvailable: true,
				siteHost: 'localhost:5173'
			},
			households: new HouseholdResolver(new HouseholdRepository(database)),
			invitations: new RegistrationInvitationLookup(database),
			link: {
				confirmFromBot: async () => {
					throw new Error('unexpected link confirmation');
				},
				offer: async () => {
					throw new Error('unexpected link offer');
				},
				rejectFromBot: async () => {
					throw new Error('unexpected link rejection');
				}
			},
			messages: loadTelegramMessages(),
			now: () => LATER,
			requests,
			sessionService: createSessionService(),
			startRateLimiter: new FixedWindowRateLimiter({ maxRequests: 100, windowMilliseconds: 60_000 })
		});
	}

	/**
	 * The operator runs `telegram:reset anna --apply --end-sessions` from another process while the browser's poll is
	 * being answered. The reset commits right after the API has resolved the Telegram account to Anna: that is the moment
	 * between «who is this» and «here is the session». Whatever the interleaving, no session may outlive the reset.
	 */
	it('leaves no valid session when the reset commits right after the account was resolved', async () => {
		await database.insert(users).values({
			createdAt: NOW, displayName: 'Анна', id: 'anna', isActive: true, passwordHash: PASSWORD_HASH, updatedAt: NOW, username: 'anna'
		});
		await database.insert(telegramAccounts).values({
			chatId: ANNA.chatId,
			firstName: ANNA.firstName,
			lastSignInAt: NOW,
			linkedAt: NOW,
			telegramId: ANNA.telegramId,
			updatedAt: NOW,
			userId: 'anna',
			username: ANNA.username
		});
		await requests.confirm({ id: 'request-1', identity: ANNA, now: LATER });

		const accounts = new TelegramAccountRepository(database);
		const reset = new UserTelegramReset(database);
		const service = createService({
			findByTelegramId: accounts.findByTelegramId.bind(accounts),
			signIn: async (input) => {
				const resolution = await accounts.signIn(input);

				reset.apply({ allowLockout: false, endSessions: true, expectedTelegramId: ANNA.telegramId, userId: 'anna' });

				return resolution;
			}
		});

		const outcome = await service.complete({ code: CODE }, SECRET, {});
		const token = outcome.kind === 'confirmed' ? outcome.session.token : undefined;

		expect(await createSessionService().validateSessionToken(token)).toBeNull();
		expect(database.select().from(sessions).all()).toEqual([]);
		expect(database.select().from(telegramAccounts).all()).toEqual([]);
	});
});

describe('TelegramAccountRepository.signIn', () => {
	function sessionRecord(id: string) {
		return { createdAt: LATER, expiresAt: AFTER_EXPIRY, id, lastSeenAt: LATER, tokenHash: `token-hash-${id}` };
	}

	async function confirmedRequest(id: string, code: string): Promise<{ id: string; secretHash: string }> {
		const secretHash = hashTelegramLoginSecret(`${SECRET}-${id}`);

		await requests.insert({ code, createdAt: NOW, expiresAt: AFTER_EXPIRY, id, purpose: 'sign-in', secretHash });
		await requests.confirm({ id, identity: ANNA, now: LATER });

		return { id, secretHash };
	}

	it('creates the user once even when two sign-ins of the same new Telegram race', async () => {
		const accounts = new TelegramAccountRepository(database);
		const requestA = await confirmedRequest('request-a', 'a'.repeat(32));
		const requestB = await confirmedRequest('request-b', 'b'.repeat(32));
		const common = { allowRegistration: true, identity: ANNA, invitationTokenHash: null, now: LATER };
		const [first, second] = await Promise.all([
			accounts.signIn({ ...common, newUserId: 'user-a', request: requestA, session: sessionRecord('session-a') }),
			accounts.signIn({ ...common, newUserId: 'user-b', request: requestB, session: sessionRecord('session-b') })
		]);

		expect(first).toEqual({ kind: 'registered', userId: 'user-a' });
		expect(second).toEqual({ isActive: true, kind: 'existing', userId: 'user-a' });
		expect(await database.select().from(users)).toHaveLength(1);
		expect(database.select({ userId: sessions.userId }).from(sessions).all()).toEqual([{ userId: 'user-a' }, { userId: 'user-a' }]);
	});

	it('never creates a user or a session when registration is closed, and the request stays used', async () => {
		const accounts = new TelegramAccountRepository(database);
		const request = await confirmedRequest('request-a', 'a'.repeat(32));

		const resolution = await accounts.signIn({
			allowRegistration: false,
			identity: ANNA,
			invitationTokenHash: null,
			newUserId: 'user-a',
			now: LATER,
			request,
			session: sessionRecord('session-a')
		});

		expect(resolution).toEqual({ kind: 'not-found' });
		expect(await database.select().from(users)).toEqual([]);
		expect(await database.select().from(sessions)).toEqual([]);
		expect((await requests.findById('request-a'))?.status).toBe('used');
	});

	it('is one transaction: when storing the session fails, the request stays confirmed and no user is created', async () => {
		const accounts = new TelegramAccountRepository(database);
		const request = await confirmedRequest('request-a', 'a'.repeat(32));

		connection.exec('CREATE TRIGGER fail_session_insert BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, \'boom\'); END;');

		await expect(accounts.signIn({
			allowRegistration: true,
			identity: ANNA,
			invitationTokenHash: null,
			newUserId: 'user-a',
			now: LATER,
			request,
			session: sessionRecord('session-a')
		})).rejects.toThrow('boom');
		expect((await requests.findById('request-a'))?.status).toBe('confirmed');
		expect(await database.select().from(users)).toEqual([]);
		expect(await database.select().from(telegramAccounts)).toEqual([]);
	});

	it('signs the same Telegram up again after telegram:reset: a new user with a free technical login, not the old account', async () => {
		const accounts = new TelegramAccountRepository(database);
		const reset = new UserTelegramReset(database);
		const signUp = async (index: number) => accounts.signIn({
			allowRegistration: true,
			identity: ANNA,
			invitationTokenHash: null,
			newUserId: `user-${index}`,
			now: LATER,
			request: await confirmedRequest(`sign-up-${index}`, String(index).repeat(32)),
			session: sessionRecord(`session-${index}`)
		});

		expect(await signUp(1)).toEqual({ kind: 'registered', userId: 'user-1' });
		reset.apply({ allowLockout: true, endSessions: true, expectedTelegramId: ANNA.telegramId, userId: 'user-1' });
		expect(await signUp(2)).toEqual({ kind: 'registered', userId: 'user-2' });
		reset.apply({ allowLockout: true, endSessions: true, expectedTelegramId: ANNA.telegramId, userId: 'user-2' });
		expect(await signUp(3)).toEqual({ kind: 'registered', userId: 'user-3' });

		expect(database.select({ id: users.id, username: users.username }).from(users).orderBy(users.id).all()).toEqual([
			{ id: 'user-1', username: 'tg-1001' },
			{ id: 'user-2', username: 'tg-1001-2' },
			{ id: 'user-3', username: 'tg-1001-3' }
		]);
		expect(database.select({ userId: telegramAccounts.userId }).from(telegramAccounts).all()).toEqual([{ userId: 'user-3' }]);
		expect(database.select({ userId: sessions.userId }).from(sessions).all()).toEqual([{ userId: 'user-3' }]);
	});

	it('changes nothing when the request is no longer confirmed for this secret', async () => {
		const accounts = new TelegramAccountRepository(database);
		const request = await confirmedRequest('request-a', 'a'.repeat(32));
		const input = {
			allowRegistration: true,
			identity: ANNA,
			invitationTokenHash: null,
			newUserId: 'user-a',
			now: LATER,
			session: sessionRecord('session-a')
		};

		expect(await accounts.signIn({ ...input, request: { ...request, secretHash: hashTelegramLoginSecret('other') } }))
			.toEqual({ kind: 'request-taken' });
		expect(await accounts.signIn({ ...input, now: AFTER_EXPIRY, request })).toEqual({ kind: 'request-taken' });
		expect(await database.select().from(users)).toEqual([]);
		expect(await database.select().from(sessions)).toEqual([]);
		expect((await requests.findById('request-a'))?.status).toBe('confirmed');
	});
});

describe('helpers', () => {
	it('compares the browser secret against the stored hash only', () => {
		const hash = hashTelegramLoginSecret(SECRET);

		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(telegramLoginSecretMatches(hash, SECRET)).toBe(true);
		expect(telegramLoginSecretMatches(hash, 'other')).toBe(false);
		expect(telegramLoginSecretMatches(hash, undefined)).toBe(false);
		expect(telegramLoginSecretMatches(hash, '')).toBe(false);
		expect(telegramLoginSecretMatches(undefined, SECRET)).toBe(false);
		expect(telegramLoginSecretMatches(hashTelegramLoginSecret(''), '')).toBe(false);
		// The hash itself is not a secret that opens anything.
		expect(telegramLoginSecretMatches(hash, hash)).toBe(false);
	});

	it('reads /start commands and button data strictly', () => {
		expect(parseStartCommand('/start')).toBeNull();
		expect(parseStartCommand(`/start ${CODE}`)).toBe(CODE);
		expect(parseStartCommand(`/start@i_finances_bot ${CODE}`)).toBe(CODE);
		expect(parseStartCommand('hello')).toBeUndefined();
		expect(parseStartCommand(undefined)).toBeUndefined();
		expect(parseSignInCallbackData(`tgl:ok:${CODE}`)).toEqual({ code: CODE, kind: 'confirm' });
		expect(parseSignInCallbackData(`tgl:no:${CODE}`)).toEqual({ code: CODE, kind: 'reject' });
		expect(parseSignInCallbackData(`tgl:ok:${CODE}x`)).toBeUndefined();
		expect(parseSignInCallbackData('confirm')).toBeUndefined();
	});

	it('describes the device from a fixed list of names and the moment in Minsk time', () => {
		expect(describeSignInDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
			+ '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe('Safari, iOS');
		expect(describeSignInDevice('Вход подтверждён, Это вы? Нажмите Войти')).toBeUndefined();
		expect(describeSignInDevice(null)).toBeUndefined();
		expect(describeSignInMoment(NOW, 'Europe/Minsk')).toBe('18 октября, 21:04');
	});

	it('builds a display name without control or direction characters', () => {
		expect(buildTelegramDisplayName({ ...ANNA, firstName: ' Анна‮ ', lastName: 'Каренина\n' })).toBe('Анна Каренина');
		expect(buildTelegramDisplayName({ ...ANNA, firstName: '​', lastName: null })).toBe('anna_k');
		expect(buildTelegramDisplayName({ ...ANNA, firstName: ' ', lastName: null, username: null })).toBe('Telegram 1001');
		expect(buildTelegramDisplayName({ ...ANNA, firstName: 'я'.repeat(64), lastName: 'ю'.repeat(64) })).toHaveLength(100);
	});
});

describe('FixedWindowRateLimiter', () => {
	it('refuses above the limit without counting the refused, per key, until the window ends', () => {
		const limiter = new FixedWindowRateLimiter({ maxRequests: 2, windowMilliseconds: 1000 });

		expect(limiter.tryConsume('a', 0).allowed).toBe(true);
		expect(limiter.tryConsume('a', 10).allowed).toBe(true);
		expect(limiter.tryConsume('a', 20)).toEqual({ allowed: false, retryAfterSeconds: 1 });
		expect(limiter.tryConsume('b', 20).allowed).toBe(true);
		expect(limiter.tryConsume('a', 1000).allowed).toBe(true);
	});
});
